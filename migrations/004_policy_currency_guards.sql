CREATE OR REPLACE FUNCTION enforce_policy_currency_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  policy_currency CHAR(3);
BEGIN
  SELECT currency INTO policy_currency
  FROM policies
  WHERE id = NEW.policy_id;

  IF policy_currency IS NULL THEN
    RAISE EXCEPTION 'Policy % does not exist', NEW.policy_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.currency <> policy_currency THEN
    RAISE EXCEPTION 'Currency % does not match policy currency %', NEW.currency, policy_currency
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_documents_currency_match ON billing_documents;
CREATE TRIGGER billing_documents_currency_match
BEFORE INSERT ON billing_documents
FOR EACH ROW
EXECUTE FUNCTION enforce_policy_currency_match();

DROP TRIGGER IF EXISTS payments_currency_match ON payments;
CREATE TRIGGER payments_currency_match
BEFORE INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION enforce_policy_currency_match();
