CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  homeowner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  term_start DATE NOT NULL,
  term_end DATE NOT NULL,
  annual_premium_cents BIGINT NOT NULL CHECK (
    annual_premium_cents >= 0
    AND annual_premium_cents <= 9000000000000000
  ),
  currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (term_end > term_start)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
  response_status INTEGER,
  response_body JSONB,
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (scope, idempotency_key),
  CHECK (
    (status = 'processing' AND response_status IS NULL AND response_body IS NULL)
    OR
    (status = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS policy_events (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  sequence_no BIGINT NOT NULL CHECK (sequence_no > 0),
  event_type TEXT NOT NULL,
  canonical_payload JSONB NOT NULL,
  previous_hash CHAR(64),
  event_hash CHAR(64) NOT NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (policy_id, sequence_no),
  UNIQUE (policy_id, event_hash)
);

CREATE TABLE IF NOT EXISTS billing_documents (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  source_event_id TEXT NOT NULL UNIQUE REFERENCES policy_events(id),
  document_type TEXT NOT NULL CHECK (document_type IN ('endorsement_adjustment')),
  amount_cents BIGINT NOT NULL CHECK (
    amount_cents <> 0
    AND ABS(amount_cents) <= 9000000000000000
  ),
  currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency)),
  status TEXT NOT NULL CHECK (status IN ('open', 'paid', 'credit')),
  issued_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  external_payment_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (
    amount_cents > 0
    AND amount_cents <= 9000000000000000
  ),
  currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency)),
  received_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, external_payment_id)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES policies(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('endorsement', 'payment')),
  source_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (policy_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  ledger_transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  account_code TEXT NOT NULL CHECK (
    account_code IN ('PREMIUM_RECEIVABLE', 'WRITTEN_PREMIUM', 'CASH')
  ),
  debit_cents BIGINT NOT NULL DEFAULT 0 CHECK (
    debit_cents >= 0
    AND debit_cents <= 9000000000000000
  ),
  credit_cents BIGINT NOT NULL DEFAULT 0 CHECK (
    credit_cents >= 0
    AND credit_cents <= 9000000000000000
  ),
  currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (debit_cents > 0 AND credit_cents = 0)
    OR
    (credit_cents > 0 AND debit_cents = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_events_policy_sequence
  ON policy_events(policy_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_billing_documents_policy
  ON billing_documents(policy_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_payments_policy
  ON payments(policy_id, received_at);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_policy
  ON ledger_transactions(policy_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction
  ON ledger_entries(ledger_transaction_id);
