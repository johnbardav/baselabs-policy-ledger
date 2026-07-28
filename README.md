# Base Labs Policy Ledger

A backend-heavy Policy Administration System slice built with NestJS, TypeScript, PostgreSQL, and raw SQL.

The application applies mid-term policy endorsements, calculates deterministic premium proration, records received-payment data, creates balanced double-entry accounting effects, and maintains an append-only tamper-evident policy history.

## Main features

- NestJS REST API
- TypeScript
- PostgreSQL
- Raw SQL migrations
- No ORM or query builder
- Integer-cent financial calculations
- Deterministic half-away-from-zero rounding
- Transactional idempotency
- Double-entry ledger
- Append-only hash-chained policy history
- Minimal operator frontend
- Swagger/OpenAPI documentation
- Unit and PostgreSQL integration tests
- Docker Compose environment

## Requirements

For the Docker execution path:

- Git
- Docker Desktop
- Docker Compose

For local Node.js development:

- Node.js 20 or newer
- Node.js 22 recommended
- npm

## Quick start

Clone the repository:

```powershell
git clone https://github.com/johnbardav/baselabs-policy-ledger.git
Set-Location .\baselabs-policy-ledger
```

Create the local environment file:

```powershell
Copy-Item .\.env.example .\.env
```

Start the complete environment:

```powershell
docker compose up --build -d
```

Check service status:

```powershell
docker compose ps
```

Wait until the `db` and `api` services report a healthy state.

Open:

- Operator UI: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- Health endpoint: `http://localhost:3000/api/health`

Run the sample scenario:

```powershell
npm.cmd run demo
```

Stop the environment:

```powershell
docker compose down
```

Reset all local database data:

```powershell
docker compose down -v
```

## Required API endpoints

```text
POST /api/policies/:policyId/endorsements
POST /api/policies/:policyId/payments
GET  /api/policies/:policyId
GET  /api/policies/:policyId/ledger
GET  /api/policies/:policyId/history/verify
GET  /api/health
```

Mutation endpoints accept the idempotency key through the `Idempotency-Key` header or the `idempotency_key` JSON property.

An exact replay returns the original result without creating duplicate financial effects.

Reusing the same key with a different payload returns HTTP 409.

## Proration rule

Money is represented as integer cents.

```text
term_days = term_end - term_start
remaining_days = term_end - effective_date

delta_cents = round_half_away_from_zero(
  (new_annual_premium_cents - old_annual_premium_cents)
  * remaining_days
  / term_days
)
```

The implementation uses `BigInt` for intermediate multiplication and division.

For the supplied example:

```text
old annual premium: 120000 cents
new annual premium: 144000 cents
effective date: 2026-07-01
term: 2026-01-01 to 2027-01-01
prorated adjustment: 12099 cents
```

## Accounting rules

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

Received payment:

```text
DR CASH
CR PREMIUM_RECEIVABLE
```

Every financial mutation runs inside one PostgreSQL transaction.

Deferred database triggers reject unbalanced ledger transactions at commit time.

## Policy history

Policy events are append-only.

Each event includes:

- canonical JSON payload
- sequence number
- previous hash
- event hash

The event hash is calculated from the previous hash and canonical payload.

Database triggers prevent updates and deletions of policy events and ledger records.

## Payment boundary

The payment endpoint only receives normalized JSON describing a payment that already occurred outside this system.

The application does not:

- contact Stripe or PayPal
- contact a bank
- authorize payments
- capture payments
- settle payments
- issue refunds
- collect card numbers
- collect bank credentials

## Tests

Install the exact dependency tree:

```powershell
npm.cmd ci
```

Run project verification:

```powershell
npm.cmd run verify
```

Build the frontend and backend:

```powershell
npm.cmd run build
```

Run unit tests:

```powershell
npm.cmd test
```

Run integration tests:

```powershell
docker compose --profile test up -d db-test
docker compose --profile test ps
npm.cmd run test:integration
docker compose --profile test down
```

## Error handling

The API rejects:

- malformed JSON
- unknown fields
- missing idempotency keys
- invalid dates
- inactive or missing policies
- conflicting idempotency payloads
- wrong payment currencies
- invalid monetary values

Expected failures return structured JSON errors.

Unexpected failures return HTTP 500 without exposing internal stack traces.

## Documentation

- [Installation](docs/INSTALL.md)
- [Run and configuration](docs/RUN.md)
- [Architecture and design decisions](docs/ARCHITECTURE.md)
- [Deployment and operations](docs/DEPLOYMENT.md)

## AI assistance

AI tools were used to assist with initial scaffolding, test ideas, documentation review, and configuration troubleshooting.

The SQL, transaction boundaries, proration arithmetic, idempotency behavior, ledger postings, history verification, and failure paths were reviewed and tested manually.

## Improvements with more time

- explicit payment allocation records
- compensating-entry and reversal workflows
- authentication and authorization
- structured logging and metrics
- pagination for long policy histories
- dedicated production migration jobs
- expanded observability dashboards
