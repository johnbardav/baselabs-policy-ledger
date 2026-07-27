export interface PolicyRow {
  id: string;
  homeowner_id: string;
  status: 'active' | 'cancelled' | 'expired';
  term_start: string | Date;
  term_end: string | Date;
  annual_premium_cents: number;
  currency: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface IdempotencyRow {
  scope: string;
  idempotency_key: string;
  request_hash: string;
  status: 'processing' | 'completed';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  replay_count: number;
}

export interface PolicyEventRow {
  id: string;
  policy_id: string;
  sequence_no: number;
  event_type: string;
  canonical_payload: Record<string, unknown>;
  previous_hash: string | null;
  event_hash: string;
  idempotency_key: string | null;
  created_at: string | Date;
  replay_count?: number;
}

export interface BillingDocumentRow {
  id: string;
  policy_id: string;
  source_event_id: string;
  document_type: 'endorsement_adjustment';
  amount_cents: number;
  currency: string;
  status: 'open' | 'paid' | 'credit';
  issued_at: string | Date;
  created_at: string | Date;
}

export interface PaymentRow {
  id: string;
  policy_id: string;
  external_payment_id: string;
  idempotency_key: string;
  amount_cents: number;
  currency: string;
  received_at: string | Date;
  status: 'applied';
  created_at: string | Date;
  replay_count?: number;
}

export interface LedgerTransactionRow {
  id: string;
  policy_id: string;
  source_type: 'endorsement' | 'payment';
  source_id: string;
  description: string;
  created_at: string | Date;
}

export interface LedgerEntryRow {
  id: string;
  ledger_transaction_id: string;
  account_code: 'PREMIUM_RECEIVABLE' | 'WRITTEN_PREMIUM' | 'CASH';
  debit_cents: number;
  credit_cents: number;
  currency: string;
  created_at: string | Date;
}

export interface IdempotentHttpResult<T extends Record<string, unknown>> {
  statusCode: number;
  body: T;
  replayed: boolean;
}
