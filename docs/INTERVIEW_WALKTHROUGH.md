# Five-to-Ten-Minute Interview Walkthrough

## 0:00-1:00 — scope and run command

- State that this is a NestJS and PostgreSQL modular monolith using raw SQL only.
- Run `docker compose up --build`.
- Show the UI, Swagger, and health endpoint.
- Clarify that payment handling is data ingestion, not payment processing.

## 1:00-2:15 — schema and invariants

Open the migrations and explain:

- policy state and term dates
- append-only policy events
- billing documents and received payments
- ledger transactions and entries
- idempotency result storage
- unique constraints
- deferred balanced-ledger trigger
- append-only update/delete guards

## 2:15-3:15 — proration

Show `calculateProration` and explain:

```text
term_days = 365
remaining_days = 184
annual delta = 24000
24000 × 184 / 365 = 12098.63...
result = 12099 cents
```

Point out `BigInt` intermediate arithmetic and half-away-from-zero rounding.

## 3:15-4:30 — transaction and idempotency

Trace the endorsement service:

1. claim key
2. lock policy
3. validate
4. append event
5. create billing document
6. post debit and credit
7. update premium
8. save original result
9. commit

Replay the same request and show the response header. Then change the payload under the same key and show HTTP 409.

## 4:30-5:30 — payment and failure path

Record `PAY-9001`, then replay it. Show that there is one payment and one payment ledger transaction.

Submit the EUR payment and explain that validation occurs inside the database transaction, so the idempotency claim and every financial write roll back together.

## 5:30-6:30 — ledger and history

Open the ledger endpoint and show equal debits and credits for each transaction.

Open the history verification endpoint and explain the canonical payload, `previous_hash`, and `event_hash` chain.

## 6:30-7:15 — frontend

Show:

- policy state and balance
- history status
- timeline
- endorsement form
- payment-data form
- loading, success, and error messages

## 7:15-8:00 — tests, AI, and improvements

Show the focused unit and integration tests. State exactly how AI was used and what was manually verified.

With more time, propose:

- explicit payment allocations
- reversal and compensating-entry APIs
- authentication and authorization
- structured logging and metrics
- dedicated migration jobs
- pagination for long histories
- stronger operational dashboards

## Likely live-change examples

Be prepared to make one of these changes:

- add a cancellation-status rule
- change a validation limit
- add a field to the policy response
- support another ledger summary filter
- add a new unit test for a leap-year term
- change the UI label or form default
