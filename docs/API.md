# API Guide

Swagger is available at `http://localhost:3000/docs` after startup. A ready-to-run request collection is also provided in `requests/api.http`.

## Endpoints

### `POST /api/policies/:policyId/endorsements`

Required header or equivalent body field:

```http
Idempotency-Key: END-2001
```

Request:

```json
{
  "effective_date": "2026-07-01",
  "new_annual_premium_cents": 144000,
  "reason": "Water-shutoff discount removed"
}
```

Creates one policy event, one billing document, one ledger transaction, and two ledger entries, and updates the current annual premium.

### `POST /api/policies/:policyId/payments`

Request:

```json
{
  "external_payment_id": "PAY-9001",
  "amount_cents": 12099,
  "currency": "USD",
  "received_at": "2026-07-03T18:30:00Z"
}
```

This endpoint records data for a payment already processed outside this service. It does not authorize, capture, settle, refund, or transmit payment credentials.

### `GET /api/policies/:policyId`

Returns:

- current policy state
- applied endorsement IDs
- billing documents
- recorded payment IDs and duplicate-delivery result
- open balance
- ledger transaction IDs and balance status
- history verification result
- timeline
- plain-English explanation and suggested action

### `GET /api/policies/:policyId/ledger`

Returns every transaction, account entry, debit and credit total, and balanced status.

### `GET /api/policies/:policyId/history/verify`

Recomputes the event chain from the genesis event through the current head.

### `GET /api/health`

Returns readiness only after PostgreSQL responds successfully. Database failures return HTTP 503.

## Important response behavior

- First successful mutation: HTTP 201.
- Same idempotency key and same payload: original HTTP status and body, plus `Idempotency-Replayed: true`.
- Same idempotency key and different payload: HTTP 409.
- Wrong payment currency: HTTP 422 and no partial writes.
- Missing policy: HTTP 404.
- Invalid JSON shape, unknown fields, or malformed values: HTTP 400.

## Example failure: wrong currency

```json
{
  "statusCode": 422,
  "error": "Currency mismatch",
  "message": "Payment currency EUR does not match policy currency USD.",
  "details": {
    "payment_currency": "EUR",
    "policy_currency": "USD"
  }
}
```

## Validation rules

- Unknown JSON fields are rejected.
- Money fields must be integer cents.
- Payment amount must be positive.
- Currency must be an uppercase three-letter code and match the policy.
- Endorsement effective date must be inside the policy term.
- Idempotency keys are limited to 128 characters and safe identifier characters.
- Timestamps must be valid ISO-8601 values.
