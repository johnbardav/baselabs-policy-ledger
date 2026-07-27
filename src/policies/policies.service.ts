import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import {
  normalizeDatabaseDate,
  normalizeIsoTimestamp,
  parseIsoDateToEpochDay,
} from '../common/utils/date';
import { hashPolicyEvent, hashRequest } from '../common/utils/hash';
import { generateId } from '../common/utils/id-generator';
import { calculateProration, formatMoney } from '../common/utils/money';
import { ApplyEndorsementDto } from './dto/apply-endorsement.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { verifyPolicyHistory } from './history';
import { PoliciesRepository } from './policies.repository';
import {
  BillingDocumentRow,
  IdempotentHttpResult,
  LedgerEntryRow,
  LedgerTransactionRow,
  PaymentRow,
  PolicyEventRow,
  PolicyRow,
} from './types';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

type ApiBody = Record<string, unknown>;

interface IdempotencyClaim {
  isNew: boolean;
  replay?: IdempotentHttpResult<ApiBody>;
}

@Injectable()
export class PoliciesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: PoliciesRepository,
  ) {}

  resolveIdempotencyKey(headerKey: string | undefined, bodyKey?: string): string {
    const normalizedHeader = headerKey?.trim();
    const normalizedBody = bodyKey?.trim();

    if (normalizedHeader && normalizedBody && normalizedHeader !== normalizedBody) {
      throw new BadRequestException({
        message: 'Idempotency-Key header and body idempotency_key must match.',
        error: 'Idempotency key mismatch',
      });
    }

    const key = normalizedHeader ?? normalizedBody;
    if (!key) {
      throw new BadRequestException({
        message: 'An Idempotency-Key header or body idempotency_key is required.',
        error: 'Missing idempotency key',
      });
    }

    if (key.length > 128 || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        message: 'Idempotency key must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.',
        error: 'Invalid idempotency key',
      });
    }

    return key;
  }

  async applyEndorsement(
    policyId: string,
    idempotencyKey: string,
    dto: ApplyEndorsementDto,
  ): Promise<IdempotentHttpResult<ApiBody>> {
    const normalizedRequest = {
      policy_id: policyId,
      effective_date: dto.effective_date,
      new_annual_premium_cents: dto.new_annual_premium_cents,
      reason: dto.reason.trim(),
    };
    const requestHash = hashRequest(normalizedRequest);
    const scope = `endorsement:${policyId}`;

    return this.database.withTransaction(async (client) => {
      const claim = await this.claimIdempotency(
        client,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (!claim.isNew && claim.replay) {
        return claim.replay;
      }

      const policy = await this.requirePolicyForUpdate(client, policyId);
      if (policy.status !== 'active') {
        throw new UnprocessableEntityException({
          message: `Policy ${policyId} must be active before an endorsement can be applied.`,
          error: 'Invalid policy status',
          details: { current_status: policy.status },
        });
      }

      const termStart = normalizeDatabaseDate(policy.term_start);
      const termEnd = normalizeDatabaseDate(policy.term_end);
      this.validateEffectiveDate(dto.effective_date, termStart, termEnd);

      let proration;
      try {
        proration = calculateProration({
          termStart,
          termEnd,
          effectiveDate: dto.effective_date,
          oldAnnualPremiumCents: policy.annual_premium_cents,
          newAnnualPremiumCents: dto.new_annual_premium_cents,
        });
      } catch (error) {
        throw new UnprocessableEntityException({
          message: error instanceof Error ? error.message : 'Proration failed.',
          error: 'Invalid endorsement proration',
        });
      }

      if (proration.proratedDeltaCents === 0) {
        throw new UnprocessableEntityException({
          message: 'The endorsement rounds to a zero-cent billing adjustment. Submit a material premium change.',
          error: 'Zero financial adjustment',
        });
      }

      const occurredAt = new Date().toISOString();
      const endorsementId = generateId('END');
      const billingDocumentId = generateId('BILL');
      const ledgerTransactionId = generateId('LTX');

      const historyEvent = await this.createPolicyEvent(client, {
        policy,
        eventType: 'endorsement.applied',
        idempotencyKey,
        occurredAt,
        data: {
          endorsement_id: endorsementId,
          effective_date: dto.effective_date,
          previous_annual_premium_cents: policy.annual_premium_cents,
          new_annual_premium_cents: dto.new_annual_premium_cents,
          annual_premium_delta_cents: proration.annualPremiumDeltaCents,
          prorated_delta_cents: proration.proratedDeltaCents,
          term_days: proration.termDays,
          remaining_days: proration.remainingDays,
          reason: dto.reason.trim(),
          billing_document_id: billingDocumentId,
          ledger_transaction_id: ledgerTransactionId,
        },
      });

      const billingDocument: BillingDocumentRow = {
        id: billingDocumentId,
        policy_id: policyId,
        source_event_id: historyEvent.id,
        document_type: 'endorsement_adjustment',
        amount_cents: proration.proratedDeltaCents,
        currency: policy.currency,
        status: proration.proratedDeltaCents > 0 ? 'open' : 'credit',
        issued_at: occurredAt,
        created_at: occurredAt,
      };
      await this.repository.insertBillingDocument(client, billingDocument);

      const ledger = this.buildEndorsementLedger({
        policy,
        endorsementId,
        ledgerTransactionId,
        amountCents: proration.proratedDeltaCents,
        occurredAt,
      });
      await this.repository.insertLedgerTransaction(
        client,
        ledger.transaction,
        ledger.entries,
      );

      await this.repository.updatePolicyPremium(
        client,
        policyId,
        dto.new_annual_premium_cents,
      );

      const openBalanceCents = await this.repository.calculateOpenBalance(client, policyId);
      if (openBalanceCents <= 0) {
        await this.repository.markPositiveBillingDocumentsPaid(client, policyId);
        if (billingDocument.amount_cents > 0) {
          billingDocument.status = 'paid';
        }
      }

      const body: ApiBody = {
        policy_id: policyId,
        status: policy.status,
        annual_premium_cents: dto.new_annual_premium_cents,
        currency: policy.currency,
        endorsement: {
          id: endorsementId,
          effective_date: dto.effective_date,
          previous_annual_premium_cents: policy.annual_premium_cents,
          new_annual_premium_cents: dto.new_annual_premium_cents,
          annual_premium_delta_cents: proration.annualPremiumDeltaCents,
          prorated_delta_cents: proration.proratedDeltaCents,
          term_days: proration.termDays,
          remaining_days: proration.remainingDays,
          rounding_rule: 'half away from zero',
          reason: dto.reason.trim(),
        },
        billing_document: {
          id: billingDocument.id,
          type: billingDocument.document_type,
          amount_cents: billingDocument.amount_cents,
          status: billingDocument.status,
        },
        open_balance_cents: openBalanceCents,
        ledger_transaction: {
          id: ledger.transaction.id,
          debits_cents: Math.abs(proration.proratedDeltaCents),
          credits_cents: Math.abs(proration.proratedDeltaCents),
          balanced: true,
        },
        history_event: {
          id: historyEvent.id,
          sequence_no: historyEvent.sequence_no,
          previous_hash: historyEvent.previous_hash,
          event_hash: historyEvent.event_hash,
        },
        idempotency: {
          key: idempotencyKey,
          result: 'processed',
        },
        explanation: `The annual premium changed from ${formatMoney(
          policy.annual_premium_cents,
          policy.currency,
        )} to ${formatMoney(dto.new_annual_premium_cents, policy.currency)}. The remaining-term adjustment is ${formatMoney(
          proration.proratedDeltaCents,
          policy.currency,
        )}.`,
        suggested_action: this.suggestAction(openBalanceCents, policy.currency),
      };

      await this.repository.completeIdempotency(
        client,
        scope,
        idempotencyKey,
        201,
        body,
      );

      return { statusCode: 201, body, replayed: false };
    });
  }

  async recordPayment(
    policyId: string,
    idempotencyKey: string,
    dto: RecordPaymentDto,
  ): Promise<IdempotentHttpResult<ApiBody>> {
    let receivedAt: string;
    try {
      receivedAt = normalizeIsoTimestamp(dto.received_at);
    } catch {
      throw new BadRequestException({
        message: 'received_at must be a valid ISO-8601 timestamp.',
        error: 'Invalid received_at',
      });
    }

    const normalizedRequest = {
      policy_id: policyId,
      external_payment_id: dto.external_payment_id.trim(),
      amount_cents: dto.amount_cents,
      currency: dto.currency,
      received_at: receivedAt,
    };
    const requestHash = hashRequest(normalizedRequest);
    const scope = `payment:${policyId}`;

    return this.database.withTransaction(async (client) => {
      const claim = await this.claimIdempotency(
        client,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (!claim.isNew && claim.replay) {
        return claim.replay;
      }

      const policy = await this.requirePolicyForUpdate(client, policyId);
      if (dto.currency !== policy.currency) {
        throw new UnprocessableEntityException({
          message: `Payment currency ${dto.currency} does not match policy currency ${policy.currency}.`,
          error: 'Currency mismatch',
          details: {
            payment_currency: dto.currency,
            policy_currency: policy.currency,
          },
        });
      }

      const existingPayment = await this.repository.findPaymentByExternalId(
        client,
        policyId,
        dto.external_payment_id.trim(),
      );
      if (existingPayment) {
        return this.handleExistingExternalPayment({
          client,
          existingPayment,
          policyId,
          currentScope: scope,
          currentKey: idempotencyKey,
          amountCents: dto.amount_cents,
          currency: dto.currency,
          receivedAt,
        });
      }

      const occurredAt = new Date().toISOString();
      const paymentId = generateId('PAY');
      const ledgerTransactionId = generateId('LTX');

      const historyEvent = await this.createPolicyEvent(client, {
        policy,
        eventType: 'payment.received',
        idempotencyKey,
        occurredAt,
        data: {
          payment_id: paymentId,
          external_payment_id: dto.external_payment_id.trim(),
          amount_cents: dto.amount_cents,
          currency: dto.currency,
          received_at: receivedAt,
          ledger_transaction_id: ledgerTransactionId,
        },
      });

      const payment: PaymentRow = {
        id: paymentId,
        policy_id: policyId,
        external_payment_id: dto.external_payment_id.trim(),
        idempotency_key: idempotencyKey,
        amount_cents: dto.amount_cents,
        currency: dto.currency,
        received_at: receivedAt,
        status: 'applied',
        created_at: occurredAt,
      };
      await this.repository.insertPayment(client, payment);

      const ledger = this.buildPaymentLedger({
        policy,
        paymentId,
        ledgerTransactionId,
        amountCents: dto.amount_cents,
        occurredAt,
      });
      await this.repository.insertLedgerTransaction(
        client,
        ledger.transaction,
        ledger.entries,
      );

      const openBalanceCents = await this.repository.calculateOpenBalance(client, policyId);
      if (openBalanceCents <= 0) {
        await this.repository.markPositiveBillingDocumentsPaid(client, policyId);
      }

      const body: ApiBody = {
        policy_id: policyId,
        payment: {
          id: payment.id,
          external_payment_id: payment.external_payment_id,
          amount_cents: payment.amount_cents,
          currency: payment.currency,
          received_at: receivedAt,
          status: payment.status,
        },
        open_balance_cents: openBalanceCents,
        ledger_transaction: {
          id: ledger.transaction.id,
          debits_cents: dto.amount_cents,
          credits_cents: dto.amount_cents,
          balanced: true,
        },
        history_event: {
          id: historyEvent.id,
          sequence_no: historyEvent.sequence_no,
          previous_hash: historyEvent.previous_hash,
          event_hash: historyEvent.event_hash,
        },
        idempotency: {
          key: idempotencyKey,
          result: 'processed',
        },
        explanation: `Recorded received-payment data for ${formatMoney(
          dto.amount_cents,
          dto.currency,
        )}. No external payment provider was called.`,
        suggested_action: this.suggestAction(openBalanceCents, policy.currency),
      };

      await this.repository.completeIdempotency(
        client,
        scope,
        idempotencyKey,
        201,
        body,
      );

      return { statusCode: 201, body, replayed: false };
    });
  }

  async getPolicyState(policyId: string): Promise<ApiBody> {
    return this.database.withReadTransaction(async (client) => {
      const policy = await this.requirePolicy(policyId, client);
      const [events, billingDocuments, payments, ledgerTransactions, ledgerEntries, openBalanceCents] =
        await Promise.all([
          this.repository.listPolicyEvents(policyId, client),
          this.repository.listBillingDocuments(policyId, client),
          this.repository.listPayments(policyId, client),
          this.repository.listLedgerTransactions(policyId, client),
          this.repository.listLedgerEntries(policyId, client),
          this.repository.calculateOpenBalanceReadOnly(policyId, client),
        ]);

      const history = verifyPolicyHistory(events);
      const ledger = this.summarizeLedger(ledgerTransactions, ledgerEntries);
      const endorsements = events
        .filter((event) => event.event_type === 'endorsement.applied')
        .map((event) => {
          const data = this.eventData(event);
          return {
            id: data.endorsement_id,
            effective_date: data.effective_date,
            previous_annual_premium_cents: data.previous_annual_premium_cents,
            new_annual_premium_cents: data.new_annual_premium_cents,
            prorated_delta_cents: data.prorated_delta_cents,
            reason: data.reason,
            idempotency_key: event.idempotency_key,
            idempotency_result:
              (event.replay_count ?? 0) > 0 ? 'duplicate ignored' : 'processed once',
            history_event_id: event.id,
          };
        });

      const paymentOutput = payments.map((payment) => ({
        id: payment.id,
        external_payment_id: payment.external_payment_id,
        amount_cents: payment.amount_cents,
        currency: payment.currency,
        received_at: normalizeIsoTimestamp(payment.received_at),
        status: payment.status,
        idempotency_key: payment.idempotency_key,
        idempotency_result:
          (payment.replay_count ?? 0) > 0 ? 'duplicate ignored' : 'processed once',
      }));

      const suggestedAction = this.suggestAction(openBalanceCents, policy.currency);
      const summary = `Policy ${policy.id} is ${policy.status}. Its current annual premium is ${formatMoney(
        policy.annual_premium_cents,
        policy.currency,
      )}; the open balance is ${formatMoney(openBalanceCents, policy.currency)}. The ledger is ${
        ledger.balanced ? 'balanced' : 'not balanced'
      } and the policy history is ${history.valid ? 'valid' : 'invalid'}.`;

      return {
        policy_id: policy.id,
        homeowner_id: policy.homeowner_id,
        status: policy.status,
        annual_premium_cents: policy.annual_premium_cents,
        currency: policy.currency,
        term_start: normalizeDatabaseDate(policy.term_start),
        term_end: normalizeDatabaseDate(policy.term_end),
        endorsements,
        billing_documents: billingDocuments.map((document) => ({
          id: document.id,
          type: document.document_type,
          amount_cents: document.amount_cents,
          currency: document.currency,
          status: document.status,
          issued_at: normalizeIsoTimestamp(document.issued_at),
        })),
        payments: paymentOutput,
        open_balance_cents: openBalanceCents,
        ledger,
        history,
        timeline: this.buildTimeline(events, billingDocuments, payments, ledgerTransactions),
        summary,
        suggested_action: suggestedAction,
      };
    });
  }

  async getLedger(policyId: string): Promise<ApiBody> {
    return this.database.withReadTransaction(async (client) => {
      await this.requirePolicy(policyId, client);
      const [transactions, entries] = await Promise.all([
        this.repository.listLedgerTransactions(policyId, client),
        this.repository.listLedgerEntries(policyId, client),
      ]);
      return {
        policy_id: policyId,
        ...this.summarizeLedger(transactions, entries),
      };
    });
  }

  async verifyHistory(policyId: string): Promise<ApiBody> {
    return this.database.withReadTransaction(async (client) => {
      await this.requirePolicy(policyId, client);
      const events = await this.repository.listPolicyEvents(policyId, client);
      return {
        policy_id: policyId,
        ...verifyPolicyHistory(events),
        events: events.map((event) => ({
          id: event.id,
          sequence_no: event.sequence_no,
          type: event.event_type,
          previous_hash: event.previous_hash,
          event_hash: event.event_hash,
        })),
      };
    });
  }

  private async claimIdempotency(
    client: PoolClient,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyClaim> {
    const created = await this.repository.tryCreateIdempotency(
      client,
      scope,
      key,
      requestHash,
    );
    if (created) {
      return { isNew: true };
    }

    const existing = await this.repository.findIdempotencyForUpdate(client, scope, key);
    if (!existing) {
      throw new InternalServerErrorException('Idempotency record could not be loaded.');
    }

    if (existing.request_hash !== requestHash) {
      throw new ConflictException({
        message: 'The idempotency key was already used with a different payload.',
        error: 'Idempotency conflict',
        details: { idempotency_key: key },
      });
    }

    if (
      existing.status !== 'completed' ||
      existing.response_status === null ||
      existing.response_body === null
    ) {
      throw new ConflictException({
        message: 'A request with this idempotency key is still processing.',
        error: 'Idempotency request in progress',
      });
    }

    await this.repository.incrementIdempotencyReplay(client, scope, key);
    return {
      isNew: false,
      replay: {
        statusCode: existing.response_status,
        body: existing.response_body,
        replayed: true,
      },
    };
  }

  private async handleExistingExternalPayment(input: {
    client: PoolClient;
    existingPayment: PaymentRow;
    policyId: string;
    currentScope: string;
    currentKey: string;
    amountCents: number;
    currency: string;
    receivedAt: string;
  }): Promise<IdempotentHttpResult<ApiBody>> {
    const existingReceivedAt = normalizeIsoTimestamp(input.existingPayment.received_at);
    const samePayload =
      input.existingPayment.amount_cents === input.amountCents &&
      input.existingPayment.currency === input.currency &&
      existingReceivedAt === input.receivedAt;

    if (!samePayload) {
      throw new ConflictException({
        message: 'external_payment_id already exists with different payment data.',
        error: 'External payment conflict',
        details: { external_payment_id: input.existingPayment.external_payment_id },
      });
    }

    const original = await this.repository.findCompletedIdempotency(
      input.client,
      `payment:${input.policyId}`,
      input.existingPayment.idempotency_key,
    );
    if (!original?.response_body || original.response_status === null) {
      throw new InternalServerErrorException(
        'Existing payment is missing its completed idempotency result.',
      );
    }

    await this.repository.incrementIdempotencyReplay(
      input.client,
      `payment:${input.policyId}`,
      input.existingPayment.idempotency_key,
    );
    await this.repository.completeIdempotency(
      input.client,
      input.currentScope,
      input.currentKey,
      original.response_status,
      original.response_body,
    );

    return {
      statusCode: original.response_status,
      body: original.response_body,
      replayed: true,
    };
  }

  private async requirePolicy(
    policyId: string,
    client?: PoolClient,
  ): Promise<PolicyRow> {
    const policy = await this.repository.findPolicy(policyId, client);
    if (!policy) {
      throw new NotFoundException({
        message: `Policy ${policyId} was not found.`,
        error: 'Policy not found',
      });
    }
    return policy;
  }

  private async requirePolicyForUpdate(
    client: PoolClient,
    policyId: string,
  ): Promise<PolicyRow> {
    const policy = await this.repository.findPolicyForUpdate(client, policyId);
    if (!policy) {
      throw new NotFoundException({
        message: `Policy ${policyId} was not found.`,
        error: 'Policy not found',
      });
    }
    return policy;
  }

  private validateEffectiveDate(
    effectiveDate: string,
    termStart: string,
    termEnd: string,
  ): void {
    try {
      const effectiveDay = parseIsoDateToEpochDay(effectiveDate);
      const startDay = parseIsoDateToEpochDay(termStart);
      const endDay = parseIsoDateToEpochDay(termEnd);
      if (effectiveDay < startDay || effectiveDay >= endDay) {
        throw new Error('outside term');
      }
    } catch {
      throw new UnprocessableEntityException({
        message: `effective_date must be on or after ${termStart} and before ${termEnd}.`,
        error: 'Effective date outside policy term',
      });
    }
  }

  private async createPolicyEvent(
    client: PoolClient,
    input: {
      policy: PolicyRow;
      eventType: string;
      idempotencyKey: string;
      occurredAt: string;
      data: Record<string, unknown>;
    },
  ): Promise<PolicyEventRow> {
    const lastEvent = await this.repository.findLastPolicyEventForUpdate(
      client,
      input.policy.id,
    );
    const eventId = generateId('EVT');
    const sequenceNo = (lastEvent?.sequence_no ?? 0) + 1;
    const previousHash = lastEvent?.event_hash ?? null;
    const canonicalPayload = {
      version: 1,
      event_id: eventId,
      event_type: input.eventType,
      policy_id: input.policy.id,
      occurred_at: input.occurredAt,
      data: input.data,
    };
    const eventHash = hashPolicyEvent(previousHash, canonicalPayload);

    const event: PolicyEventRow = {
      id: eventId,
      policy_id: input.policy.id,
      sequence_no: sequenceNo,
      event_type: input.eventType,
      canonical_payload: canonicalPayload,
      previous_hash: previousHash,
      event_hash: eventHash,
      idempotency_key: input.idempotencyKey,
      created_at: input.occurredAt,
    };
    await this.repository.insertPolicyEvent(client, event);
    return event;
  }

  private buildEndorsementLedger(input: {
    policy: PolicyRow;
    endorsementId: string;
    ledgerTransactionId: string;
    amountCents: number;
    occurredAt: string;
  }): { transaction: LedgerTransactionRow; entries: LedgerEntryRow[] } {
    const amount = Math.abs(input.amountCents);
    const transaction: LedgerTransactionRow = {
      id: input.ledgerTransactionId,
      policy_id: input.policy.id,
      source_type: 'endorsement',
      source_id: input.endorsementId,
      description: `Prorated endorsement adjustment ${input.endorsementId}`,
      created_at: input.occurredAt,
    };

    const positive = input.amountCents > 0;
    const entries: LedgerEntryRow[] = positive
      ? [
          this.ledgerEntry(input.ledgerTransactionId, 'PREMIUM_RECEIVABLE', amount, 0, input.policy.currency, input.occurredAt),
          this.ledgerEntry(input.ledgerTransactionId, 'WRITTEN_PREMIUM', 0, amount, input.policy.currency, input.occurredAt),
        ]
      : [
          this.ledgerEntry(input.ledgerTransactionId, 'WRITTEN_PREMIUM', amount, 0, input.policy.currency, input.occurredAt),
          this.ledgerEntry(input.ledgerTransactionId, 'PREMIUM_RECEIVABLE', 0, amount, input.policy.currency, input.occurredAt),
        ];

    return { transaction, entries };
  }

  private buildPaymentLedger(input: {
    policy: PolicyRow;
    paymentId: string;
    ledgerTransactionId: string;
    amountCents: number;
    occurredAt: string;
  }): { transaction: LedgerTransactionRow; entries: LedgerEntryRow[] } {
    const transaction: LedgerTransactionRow = {
      id: input.ledgerTransactionId,
      policy_id: input.policy.id,
      source_type: 'payment',
      source_id: input.paymentId,
      description: `Received payment data ${input.paymentId}`,
      created_at: input.occurredAt,
    };
    return {
      transaction,
      entries: [
        this.ledgerEntry(input.ledgerTransactionId, 'CASH', input.amountCents, 0, input.policy.currency, input.occurredAt),
        this.ledgerEntry(input.ledgerTransactionId, 'PREMIUM_RECEIVABLE', 0, input.amountCents, input.policy.currency, input.occurredAt),
      ],
    };
  }

  private ledgerEntry(
    transactionId: string,
    accountCode: LedgerEntryRow['account_code'],
    debitCents: number,
    creditCents: number,
    currency: string,
    createdAt: string,
  ): LedgerEntryRow {
    return {
      id: generateId('LEN'),
      ledger_transaction_id: transactionId,
      account_code: accountCode,
      debit_cents: debitCents,
      credit_cents: creditCents,
      currency,
      created_at: createdAt,
    };
  }

  private summarizeLedger(
    transactions: LedgerTransactionRow[],
    entries: LedgerEntryRow[],
  ): ApiBody {
    const output = transactions.map((transaction) => {
      const transactionEntries = entries.filter(
        (entry) => entry.ledger_transaction_id === transaction.id,
      );
      const debitsCents = transactionEntries.reduce(
        (total, entry) => total + entry.debit_cents,
        0,
      );
      const creditsCents = transactionEntries.reduce(
        (total, entry) => total + entry.credit_cents,
        0,
      );
      return {
        id: transaction.id,
        source: transaction.source_id,
        source_type: transaction.source_type,
        description: transaction.description,
        debits_cents: debitsCents,
        credits_cents: creditsCents,
        balanced:
          transactionEntries.length >= 2 &&
          debitsCents > 0 &&
          debitsCents === creditsCents,
        entries: transactionEntries.map((entry) => ({
          id: entry.id,
          account: entry.account_code,
          debit_cents: entry.debit_cents,
          credit_cents: entry.credit_cents,
          currency: entry.currency,
        })),
      };
    });

    const totalDebitsCents = entries.reduce((total, entry) => total + entry.debit_cents, 0);
    const totalCreditsCents = entries.reduce((total, entry) => total + entry.credit_cents, 0);
    return {
      balanced:
        output.every((transaction) => transaction.balanced) &&
        totalDebitsCents === totalCreditsCents,
      total_debits_cents: totalDebitsCents,
      total_credits_cents: totalCreditsCents,
      transaction_count: transactions.length,
      transactions: output,
    };
  }

  private eventData(event: PolicyEventRow): Record<string, unknown> {
    const data = event.canonical_payload.data;
    return data !== null && typeof data === 'object'
      ? (data as Record<string, unknown>)
      : {};
  }

  private buildTimeline(
    events: PolicyEventRow[],
    billingDocuments: BillingDocumentRow[],
    payments: PaymentRow[],
    ledgerTransactions: LedgerTransactionRow[],
  ): ApiBody[] {
    const items: ApiBody[] = [
      ...events.map((event) => ({
        occurred_at: normalizeIsoTimestamp(event.created_at),
        category: 'policy_event',
        type: event.event_type,
        id: event.id,
        sequence_no: event.sequence_no,
      })),
      ...billingDocuments.map((document) => ({
        occurred_at: normalizeIsoTimestamp(document.issued_at),
        category: 'billing_document',
        type: document.document_type,
        id: document.id,
        amount_cents: document.amount_cents,
        status: document.status,
      })),
      ...payments.map((payment) => ({
        occurred_at: normalizeIsoTimestamp(payment.received_at),
        category: 'payment',
        type: 'payment.received',
        id: payment.id,
        external_payment_id: payment.external_payment_id,
        amount_cents: payment.amount_cents,
        status: payment.status,
      })),
      ...ledgerTransactions.map((transaction) => ({
        occurred_at: normalizeIsoTimestamp(transaction.created_at),
        category: 'ledger_transaction',
        type: transaction.source_type,
        id: transaction.id,
        source_id: transaction.source_id,
      })),
    ];

    return items.sort((left, right) =>
      String(left.occurred_at).localeCompare(String(right.occurred_at)),
    );
  }

  private suggestAction(openBalanceCents: number, currency: string): string {
    if (openBalanceCents > 0) {
      return `Collect the remaining balance of ${formatMoney(openBalanceCents, currency)}.`;
    }
    if (openBalanceCents < 0) {
      return `Review the policy credit balance of ${formatMoney(
        Math.abs(openBalanceCents),
        currency,
      )}.`;
    }
    return 'No action required.';
  }
}
