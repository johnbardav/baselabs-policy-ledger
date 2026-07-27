CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced(transaction_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  entry_count INTEGER;
  total_debits BIGINT;
  total_credits BIGINT;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(debit_cents), 0),
    COALESCE(SUM(credit_cents), 0)
  INTO entry_count, total_debits, total_credits
  FROM ledger_entries
  WHERE ledger_transaction_id = transaction_id;

  IF entry_count < 2 OR total_debits <> total_credits OR total_debits <= 0 THEN
    RAISE EXCEPTION
      'Ledger transaction % is not balanced: entries %, debits %, credits %',
      transaction_id,
      entry_count,
      total_debits,
      total_credits
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION check_ledger_transaction_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_ledger_transaction_balanced(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_transaction_must_balance ON ledger_transactions;
CREATE CONSTRAINT TRIGGER ledger_transaction_must_balance
AFTER INSERT ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_ledger_transaction_after_insert();

CREATE OR REPLACE FUNCTION check_ledger_entries_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_ledger_transaction_balanced(NEW.ledger_transaction_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_must_balance ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_entries_must_balance
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_ledger_entries_after_insert();
