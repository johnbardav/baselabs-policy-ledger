# On-Call Monitoring and Recovery

## What to monitor

- API request rate, latency, and HTTP status by route
- database connection-pool usage and query latency
- PostgreSQL CPU, storage, locks, and replication or backup health
- idempotency conflict rate
- wrong-currency rejection rate
- transaction rollback rate
- ledger verification failures
- policy-history verification failures
- health-check failures and container restarts

## Useful log fields

Every request returns an `x-request-id`. Production logs should include:

- request ID
- route and method
- policy ID
- idempotency scope and key, with sensitive payload data excluded
- database transaction outcome
- error class and PostgreSQL error code
- duration

## Incident checks

### API is unhealthy

1. Check `/api/health`.
2. Check application and PostgreSQL logs.
3. Confirm `DATABASE_URL` and network access.
4. Check pool exhaustion and blocked locks.
5. Restart the API only after confirming that PostgreSQL is healthy.

Uncommitted financial writes are rolled back automatically. Retried requests remain safe when callers reuse the same idempotency key.

### Suspected duplicate financial effect

1. Search `idempotency_records` by scope and key.
2. Search `ledger_transactions` by `source_type` and `source_id`.
3. Confirm the unique constraints prevented a second source transaction.
4. Do not edit ledger rows. Post a compensating transaction if a business correction is required.

### Ledger verification fails

The database normally prevents new unbalanced transactions. Treat a failure as possible manual database tampering, a disabled trigger, or a restore problem.

1. Stop financial mutation traffic.
2. Preserve logs and a database snapshot.
3. Identify the first invalid transaction.
4. Restore from a known-good backup or post an approved compensating entry.
5. Never update or delete the original ledger entries.

### Policy history verification fails

1. Capture the first invalid sequence and hashes.
2. Compare the affected row with backups and audit logs.
3. Stop writes for that policy.
4. Restore from a trustworthy snapshot when tampering is confirmed.
5. Represent legitimate corrections as new events.

## Recovery priorities

1. Preserve evidence and prevent additional writes.
2. Verify PostgreSQL consistency and backups.
3. Restore service in read-only mode when useful.
4. Reconcile policy balances and ledger totals.
5. Resume writes only after history and ledger checks pass.
