# Testing

## Test coverage included

Unit tests cover:

- assessment-sample proration result
- positive and negative half-away-from-zero rounding
- negative premium adjustments
- out-of-term dates
- canonical JSON key ordering
- deterministic request hashing
- valid history chains
- tamper detection

No payment-gateway mock is included because the assessment defines payment handling as internal JSON ingestion and explicitly excludes provider integration. The integration suite tests the ingestion boundary directly, which is the actual contract.

The PostgreSQL integration test covers:

- endorsement creation
- exact duplicate endorsement replay
- conflicting payload under the same key
- wrong-currency atomic rollback, including the idempotency claim
- payment ingestion
- exact duplicate payment replay
- duplicate external payment ID under a different idempotency key
- conflicting external payment payload rejection
- open balance
- balanced ledger
- valid two-event history chain
- database rejection and rollback of an unbalanced ledger transaction
- database rejection of policy-event updates

## Unit tests

```powershell
npm test
```

## Integration tests with Docker

Start the disposable test database:

```powershell
docker compose --profile test up -d db-test
```

Wait until it is healthy:

```powershell
docker compose --profile test ps
```

Run the integration suite:

```powershell
npm run test:integration
```

Stop the test database:

```powershell
docker compose --profile test down
```

## All tests

```powershell
docker compose --profile test up -d db-test
npm run test:all
docker compose --profile test down
```

## Build and structure checks

```powershell
npm run verify
npm run build
```

## Manual interview checks

1. Run `./scripts/demo.ps1`.
2. Confirm the sample endorsement is `12099` cents.
3. Confirm both duplicate requests return `Idempotency-Replayed: true`.
4. Confirm the EUR payment is rejected.
5. Confirm only two ledger transactions exist.
6. Confirm every transaction has equal debits and credits.
7. Confirm history verification reports two valid events.
8. Open the UI and repeat one operation through the form.
