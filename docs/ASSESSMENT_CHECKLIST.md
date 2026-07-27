# Assessment Coverage Checklist

## Core API

| Requirement | Implementation |
|---|---|
| Raw SQL data model | `migrations/001_core_schema.sql` creates policies, policy events, billing documents, payments, ledger transactions, ledger entries, and idempotency records. |
| `POST /api/policies/:policyId/endorsements` | `PoliciesController.applyEndorsement` and `PoliciesService.applyEndorsement` validate, prorate, create a billing document, append a policy event, post ledger entries, and update the policy. |
| Idempotent endorsement | Canonical request hash plus stored original response in `idempotency_records`; exact replay returns original body; conflicting replay returns 409. |
| `POST /api/policies/:policyId/payments` | Records normalized payment metadata, validates currency, persists the payment, appends a policy event, and posts accounting effects. |
| Duplicate payment delivery | Protects both idempotency key and `external_payment_id`; exact duplicates under the same or a new delivery key return the original result without new financial effects. |
| `GET /api/policies/:policyId` | Returns policy state, endorsements, billing documents, payments, balance, ledger summary, history status, timeline, explanation, and suggested action. |
| `GET /api/policies/:policyId/ledger` | Returns all ledger transactions and entries with debit, credit, and balanced totals. |
| `GET /api/policies/:policyId/history/verify` | Recomputes sequence, `previous_hash`, and `event_hash` for the complete chain. |

## Financial and system correctness

| Requirement | Implementation |
|---|---|
| Atomic financial mutations | `DatabaseService.withTransaction`; every mutation is committed or rolled back as one unit. |
| Balanced debit and credit | Application writes paired entries; deferred PostgreSQL triggers reject unbalanced transactions at commit. |
| Integer cents | TypeScript integer validation, `BigInt` proration intermediates, PostgreSQL `BIGINT`, and safe-range constraints. |
| Half-away-from-zero rounding | `roundFractionHalfAwayFromZero` in `src/common/utils/money.ts`. |
| Positive endorsement posting | DR `PREMIUM_RECEIVABLE`, CR `WRITTEN_PREMIUM`. |
| Negative endorsement posting | DR `WRITTEN_PREMIUM`, CR `PREMIUM_RECEIVABLE`. |
| Payment posting | DR `CASH`, CR `PREMIUM_RECEIVABLE`. |
| Append-only policy history | Hash chain plus database trigger rejecting update/delete. |
| Append-only ledger | Database triggers reject update/delete on transactions and entries. |
| Wrong-currency atomic failure | Currency is checked inside the transaction; database also enforces policy currency for payment and billing rows. |
| No partial writes | Errors roll back the idempotency claim, event, billing/payment row, ledger transaction, entries, and policy update. |

## Tests

| Required test | Location |
|---|---|
| Proration | `test/unit/proration.spec.ts` |
| Duplicate delivery | `test/integration/policy-flow.e2e-spec.ts` |
| Wrong-currency failure | `test/integration/policy-flow.e2e-spec.ts` |
| Balanced ledger writes | Integration test plus deferred SQL constraint trigger |
| History verification | `test/unit/history.spec.ts` and integration test |

## Minimal frontend

| Requirement | Implementation |
|---|---|
| Policy state view | Summary cards show ID, status, premium, currency, term, balance, ledger, and history status. |
| Timeline/summary | Timeline combines policy events, billing documents, payments, and ledger transactions. |
| Endorsement form | Sends JSON-equivalent fields and displays success or validation errors. |
| Received-payment form | Sends payment metadata and never requests card or bank credentials. |
| Loading/success/error states | Implemented in `frontend/app.ts`. |

## Required output information

The policy-state response includes:

- policy ID and status
- current annual premium in cents
- applied endorsement IDs
- billing document ID, type, amount, and status
- payment IDs and idempotency results
- open balance
- ledger transaction IDs and balanced status
- history verification result
- plain-English explanation
- suggested next action

## Documentation and operations

| Requirement | Document |
|---|---|
| Installation | `docs/INSTALL.md` |
| Execution and configuration | `docs/RUN.md` |
| API design and errors | `docs/API.md` |
| SQL schema and business rules | `docs/ARCHITECTURE.md` |
| Tests | `docs/TESTING.md` |
| AI usage and manual verification | `docs/AI_USAGE.md` |
| Improvements with more time | `docs/INTERVIEW_WALKTHROUGH.md` |
| Monitoring and recovery | `docs/ON_CALL.md` |
| Container deployment | `docs/DEPLOYMENT.md` |
| Logical Git history | `docs/COMMIT_PLAN.md` |

## Explicitly out of scope

- no ORM
- no Stripe, PayPal, bank, gateway, or provider webhook
- no card-number or bank-credential collection
- no authorization, capture, settlement, or refund flow
- no full authentication and authorization system
- no full PAS implementation
- no polished design system
