CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS policy_events_append_only ON policy_events;
CREATE TRIGGER policy_events_append_only
BEFORE UPDATE OR DELETE ON policy_events
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS ledger_transactions_append_only ON ledger_transactions;
CREATE TRIGGER ledger_transactions_append_only
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS ledger_entries_append_only ON ledger_entries;
CREATE TRIGGER ledger_entries_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION reject_append_only_mutation();
