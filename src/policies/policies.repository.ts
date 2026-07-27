import { Injectable } from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import {
  BillingDocumentRow,
  IdempotencyRow,
  LedgerEntryRow,
  LedgerTransactionRow,
  PaymentRow,
  PolicyEventRow,
  PolicyRow,
} from './types';

@Injectable()
export class PoliciesRepository {
  constructor(private readonly database: DatabaseService) {}

  private query<T extends QueryResultRow>(
    client: PoolClient | undefined,
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return client
      ? client.query<T>(text, values)
      : this.database.query<T>(text, values);
  }

  findPolicy(policyId: string, client?: PoolClient): Promise<PolicyRow | null> {
    return this.query<PolicyRow>(client, 'SELECT * FROM policies WHERE id = $1', [policyId])
      .then((result) => result.rows[0] ?? null);
  }

  async findPolicyForUpdate(client: PoolClient, policyId: string): Promise<PolicyRow | null> {
    const result = await client.query<PolicyRow>(
      'SELECT * FROM policies WHERE id = $1 FOR UPDATE',
      [policyId],
    );
    return result.rows[0] ?? null;
  }

  async tryCreateIdempotency(
    client: PoolClient,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        INSERT INTO idempotency_records (
          scope,
          idempotency_key,
          request_hash,
          status
        )
        VALUES ($1, $2, $3, 'processing')
        ON CONFLICT (scope, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [scope, key, requestHash],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async findIdempotencyForUpdate(
    client: PoolClient,
    scope: string,
    key: string,
  ): Promise<IdempotencyRow | null> {
    const result = await client.query<IdempotencyRow>(
      `
        SELECT
          scope,
          idempotency_key,
          request_hash,
          status,
          response_status,
          response_body,
          replay_count
        FROM idempotency_records
        WHERE scope = $1 AND idempotency_key = $2
        FOR UPDATE
      `,
      [scope, key],
    );
    return result.rows[0] ?? null;
  }

  async completeIdempotency(
    client: PoolClient,
    scope: string,
    key: string,
    responseStatus: number,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `
        UPDATE idempotency_records
        SET
          status = 'completed',
          response_status = $3,
          response_body = $4::jsonb,
          completed_at = NOW()
        WHERE scope = $1 AND idempotency_key = $2
      `,
      [scope, key, responseStatus, JSON.stringify(responseBody)],
    );
  }

  async incrementIdempotencyReplay(
    client: PoolClient,
    scope: string,
    key: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE idempotency_records
        SET replay_count = replay_count + 1
        WHERE scope = $1 AND idempotency_key = $2
      `,
      [scope, key],
    );
  }

  async findCompletedIdempotency(
    client: PoolClient,
    scope: string,
    key: string,
  ): Promise<IdempotencyRow | null> {
    const result = await client.query<IdempotencyRow>(
      `
        SELECT
          scope,
          idempotency_key,
          request_hash,
          status,
          response_status,
          response_body,
          replay_count
        FROM idempotency_records
        WHERE scope = $1 AND idempotency_key = $2 AND status = 'completed'
      `,
      [scope, key],
    );
    return result.rows[0] ?? null;
  }

  async updatePolicyPremium(
    client: PoolClient,
    policyId: string,
    annualPremiumCents: number,
  ): Promise<void> {
    await client.query(
      `
        UPDATE policies
        SET annual_premium_cents = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [policyId, annualPremiumCents],
    );
  }

  async findLastPolicyEventForUpdate(
    client: PoolClient,
    policyId: string,
  ): Promise<PolicyEventRow | null> {
    const result = await client.query<PolicyEventRow>(
      `
        SELECT *
        FROM policy_events
        WHERE policy_id = $1
        ORDER BY sequence_no DESC
        LIMIT 1
        FOR UPDATE
      `,
      [policyId],
    );
    return result.rows[0] ?? null;
  }

  async insertPolicyEvent(client: PoolClient, event: PolicyEventRow): Promise<void> {
    await client.query(
      `
        INSERT INTO policy_events (
          id,
          policy_id,
          sequence_no,
          event_type,
          canonical_payload,
          previous_hash,
          event_hash,
          idempotency_key,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      `,
      [
        event.id,
        event.policy_id,
        event.sequence_no,
        event.event_type,
        JSON.stringify(event.canonical_payload),
        event.previous_hash,
        event.event_hash,
        event.idempotency_key,
        event.created_at,
      ],
    );
  }

  async insertBillingDocument(
    client: PoolClient,
    document: BillingDocumentRow,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO billing_documents (
          id,
          policy_id,
          source_event_id,
          document_type,
          amount_cents,
          currency,
          status,
          issued_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        document.id,
        document.policy_id,
        document.source_event_id,
        document.document_type,
        document.amount_cents,
        document.currency,
        document.status,
        document.issued_at,
      ],
    );
  }

  async insertPayment(client: PoolClient, payment: PaymentRow): Promise<void> {
    await client.query(
      `
        INSERT INTO payments (
          id,
          policy_id,
          external_payment_id,
          idempotency_key,
          amount_cents,
          currency,
          received_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        payment.id,
        payment.policy_id,
        payment.external_payment_id,
        payment.idempotency_key,
        payment.amount_cents,
        payment.currency,
        payment.received_at,
        payment.status,
      ],
    );
  }

  async findPaymentByExternalId(
    client: PoolClient,
    policyId: string,
    externalPaymentId: string,
  ): Promise<PaymentRow | null> {
    const result = await client.query<PaymentRow>(
      `
        SELECT *
        FROM payments
        WHERE policy_id = $1 AND external_payment_id = $2
        FOR UPDATE
      `,
      [policyId, externalPaymentId],
    );
    return result.rows[0] ?? null;
  }

  async insertLedgerTransaction(
    client: PoolClient,
    transaction: LedgerTransactionRow,
    entries: LedgerEntryRow[],
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO ledger_transactions (
          id,
          policy_id,
          source_type,
          source_id,
          description,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        transaction.id,
        transaction.policy_id,
        transaction.source_type,
        transaction.source_id,
        transaction.description,
        transaction.created_at,
      ],
    );

    for (const entry of entries) {
      await client.query(
        `
          INSERT INTO ledger_entries (
            id,
            ledger_transaction_id,
            account_code,
            debit_cents,
            credit_cents,
            currency,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          entry.id,
          entry.ledger_transaction_id,
          entry.account_code,
          entry.debit_cents,
          entry.credit_cents,
          entry.currency,
          entry.created_at,
        ],
      );
    }
  }

  async calculateOpenBalance(client: PoolClient, policyId: string): Promise<number> {
    const result = await client.query<{ open_balance_cents: number }>(
      `
        SELECT
          COALESCE((
            SELECT SUM(amount_cents)
            FROM billing_documents
            WHERE policy_id = $1
          ), 0)::BIGINT
          -
          COALESCE((
            SELECT SUM(amount_cents)
            FROM payments
            WHERE policy_id = $1 AND status = 'applied'
          ), 0)::BIGINT AS open_balance_cents
      `,
      [policyId],
    );
    return result.rows[0]?.open_balance_cents ?? 0;
  }

  async markPositiveBillingDocumentsPaid(
    client: PoolClient,
    policyId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE billing_documents
        SET status = 'paid'
        WHERE policy_id = $1 AND amount_cents > 0 AND status = 'open'
      `,
      [policyId],
    );
  }

  listPolicyEvents(policyId: string, client?: PoolClient): Promise<PolicyEventRow[]> {
    return this.query<PolicyEventRow>(
      client,
      `
          SELECT pe.*, COALESCE(i.replay_count, 0) AS replay_count
          FROM policy_events pe
          LEFT JOIN idempotency_records i
            ON i.scope = CASE
              WHEN pe.event_type = 'endorsement.applied' THEN 'endorsement:' || pe.policy_id
              WHEN pe.event_type = 'payment.received' THEN 'payment:' || pe.policy_id
              ELSE ''
            END
            AND i.idempotency_key = pe.idempotency_key
          WHERE pe.policy_id = $1
          ORDER BY pe.sequence_no ASC
        `,
      [policyId],
    )
      .then((result) => result.rows);
  }

  listBillingDocuments(policyId: string, client?: PoolClient): Promise<BillingDocumentRow[]> {
    return this.query<BillingDocumentRow>(
      client,
      `
          SELECT *
          FROM billing_documents
          WHERE policy_id = $1
          ORDER BY issued_at ASC, id ASC
        `,
      [policyId],
    )
      .then((result) => result.rows);
  }

  listPayments(policyId: string, client?: PoolClient): Promise<PaymentRow[]> {
    return this.query<PaymentRow>(
      client,
      `
          SELECT p.*, COALESCE(i.replay_count, 0) AS replay_count
          FROM payments p
          LEFT JOIN idempotency_records i
            ON i.scope = 'payment:' || p.policy_id
            AND i.idempotency_key = p.idempotency_key
          WHERE p.policy_id = $1
          ORDER BY p.received_at ASC, p.id ASC
        `,
      [policyId],
    )
      .then((result) => result.rows);
  }

  listLedgerTransactions(policyId: string, client?: PoolClient): Promise<LedgerTransactionRow[]> {
    return this.query<LedgerTransactionRow>(
      client,
      `
          SELECT *
          FROM ledger_transactions
          WHERE policy_id = $1
          ORDER BY created_at ASC, id ASC
        `,
      [policyId],
    )
      .then((result) => result.rows);
  }

  listLedgerEntries(policyId: string, client?: PoolClient): Promise<LedgerEntryRow[]> {
    return this.query<LedgerEntryRow>(
      client,
      `
          SELECT le.*
          FROM ledger_entries le
          INNER JOIN ledger_transactions lt ON lt.id = le.ledger_transaction_id
          WHERE lt.policy_id = $1
          ORDER BY lt.created_at ASC, le.id ASC
        `,
      [policyId],
    )
      .then((result) => result.rows);
  }

  calculateOpenBalanceReadOnly(policyId: string, client?: PoolClient): Promise<number> {
    return this.query<{ open_balance_cents: number }>(
      client,
      `
          SELECT
            COALESCE((
              SELECT SUM(amount_cents)
              FROM billing_documents
              WHERE policy_id = $1
            ), 0)::BIGINT
            -
            COALESCE((
              SELECT SUM(amount_cents)
              FROM payments
              WHERE policy_id = $1 AND status = 'applied'
            ), 0)::BIGINT AS open_balance_cents
        `,
      [policyId],
    )
      .then((result) => result.rows[0]?.open_balance_cents ?? 0);
  }
}
