# Architecture and Design Decisions

## System shape

The project is a focused modular monolith:

```text
Browser UI
   |
   v
NestJS REST API
   |
   v
PostgreSQL
  - policy state
  - billing documents
  - received payments
  - double-entry ledger
  - hash-chained policy events
  - idempotency results
```

The frontend is intentionally small and is served as static assets by the same NestJS process. This keeps the assessment focused on backend correctness while still demonstrating the complete operator workflow.

## Module boundaries

- `src/policies`: HTTP endpoints, business orchestration, raw SQL repository, history verification
- `src/common/database`: PostgreSQL pool and transaction wrapper
- `src/common/utils`: canonical JSON, hashing, dates, IDs, and integer proration
- `src/health`: readiness endpoint
- `migrations`: raw SQL schema, ledger constraints, and append-only guards
- `frontend` and `public`: minimal operator interface

## Transaction boundaries

Each endorsement or payment request executes in one PostgreSQL transaction:

1. Claim the idempotency key.
2. Lock the policy row with `SELECT ... FOR UPDATE`.
3. Validate all business rules.
4. Append the policy event.
5. Write the billing or payment record.
6. Write one ledger transaction and its entries.
7. Update derived mutable state when needed.
8. Persist the original HTTP result in the idempotency record.
9. Commit.

Any exception rolls back every write, including the temporary idempotency claim.

Read endpoints use a single read-only `REPEATABLE READ` transaction so policy state, balance, ledger, and history are returned from one consistent database snapshot.

## Idempotency

Idempotency is scoped by operation and policy:

```text
endorsement:POL-1001 + END-2001
payment:POL-1001 + PAY-9001
```

A canonical request hash is stored with the key.

- Same key and same canonical payload: increment replay metadata, return the stored status and response body, and add `Idempotency-Replayed: true`.
- Same key and different payload: return HTTP 409.
- Same external payment ID with the same payment data but a new idempotency key: return the original result without new accounting effects.
- Same external payment ID with different data: return HTTP 409.

The insert uses a unique constraint and `ON CONFLICT DO NOTHING`. Concurrent requests with the same key serialize on PostgreSQL's unique-index conflict handling.

## Money and proration

Money is represented as integer cents in TypeScript and `BIGINT` in PostgreSQL. Database checks keep values within JavaScript's safe-integer range.

Proration uses `BigInt` for the multiplication and division:

```text
annual_delta = new_annual_premium - old_annual_premium
numerator = annual_delta * remaining_days
prorated_delta = round_half_away_from_zero(numerator / term_days)
```

The term end date is exclusive. An effective date must be on or after `term_start` and before `term_end`.

A change that rounds to zero cents is rejected because the assessment requires a real billing adjustment and balanced non-zero ledger effects.

## Double-entry accounting

Positive endorsement adjustment:

```text
DR PREMIUM_RECEIVABLE
CR WRITTEN_PREMIUM
```

Negative endorsement adjustment:

```text
DR WRITTEN_PREMIUM
CR PREMIUM_RECEIVABLE
```

Received payment data:

```text
DR CASH
CR PREMIUM_RECEIVABLE
```

PostgreSQL deferred constraint triggers verify at commit that every new ledger transaction has at least two entries, positive activity, and equal debit and credit totals. The application also returns a readable balance proof.

## Append-only history

Every policy event stores:

- monotonically increasing `sequence_no`
- canonical JSON payload
- `previous_hash`
- `event_hash`

Hash input:

```text
SHA-256((previous_hash or "GENESIS") + "|" + canonical_json(payload))
```

Canonical JSON recursively sorts object keys. The verification endpoint recomputes the complete chain and reports the first invalid sequence when a mismatch exists.

Database triggers reject `UPDATE` and `DELETE` on policy events, ledger transactions, and ledger entries. Corrections must be represented by new records.

## Balance and billing status

The policy-level open balance is:

```text
sum(billing_document.amount_cents) - sum(applied_payment.amount_cents)
```

A negative result is a policy credit. The assessment does not require payment allocations, so positive billing documents remain open during partial payment and are marked paid when the policy-level balance reaches zero or becomes a credit.

## Error model

All errors use a consistent JSON envelope:

```json
{
  "statusCode": 409,
  "error": "Idempotency conflict",
  "message": "The idempotency key was already used with a different payload.",
  "path": "/api/policies/POL-1001/endorsements",
  "timestamp": "2026-07-27T20:00:00.000Z",
  "requestId": "..."
}
```

Expected business failures are explicit HTTP exceptions. Unexpected failures are logged server-side and returned as HTTP 500 without exposing internal stack traces.

## Deliberate scope choices

- No ORM or query builder
- No authentication beyond local-assessment assumptions
- No payment gateway or real money movement
- No payment-allocation subledger
- No distributed event bus
- No polished design system

These choices preserve the assessment's six-hour focus and make every financial rule easy to explain.
