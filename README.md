# Base Labs Policy Ledger

A backend-heavy Policy Administration System slice built with **NestJS**, **TypeScript**, **PostgreSQL**, and **raw SQL only**. It applies mid-term endorsements, ingests payment data already processed by another system, posts balanced double-entry ledger effects, and maintains a tamper-evident append-only policy history.

## What is included

- Required REST endpoints under `/api/policies/:policyId`
- Deterministic proration using integer arithmetic and half-away-from-zero rounding
- Transactional idempotency for endorsements and payment ingestion
- Raw SQL migrations with database-enforced ledger balance and append-only guards
- Minimal operator UI served by the NestJS application
- Swagger/OpenAPI documentation
- Unit and PostgreSQL integration tests
- Docker Compose for the application, development database, and test database
- Sample assessment data and an automated demo script
- Installation, run, architecture, testing, deployment, on-call, AI-usage, commit, and interview notes

## Fastest start on Windows 11

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open:

- Operator UI: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- Health check: `http://localhost:3000/api/health`

Run the supplied scenario in another PowerShell terminal:

```powershell
./scripts/demo.ps1
```

Stop the environment:

```powershell
docker compose down
```

Remove the database volume and reset all local data:

```powershell
docker compose down -v
```

## Documentation

- [Installation](docs/INSTALL.md)
- [Run and configuration](docs/RUN.md)
- [Assessment coverage checklist](docs/ASSESSMENT_CHECKLIST.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [API examples and error behavior](docs/API.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [On-call monitoring and recovery](docs/ON_CALL.md)
- [AI usage and manual verification](docs/AI_USAGE.md)
- [Thirty-minute commit plan](docs/COMMIT_PLAN.md)
- [Interview walkthrough](docs/INTERVIEW_WALKTHROUGH.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## Core business rules

```text
term_days = term_end - term_start
remaining_days = term_end - effective_date
prorated_delta_cents = round_half_away_from_zero(
  (new_annual_premium_cents - old_annual_premium_cents)
  * remaining_days / term_days
)
```

All money is stored as integer cents. No ORM is used. Every financial mutation is wrapped in one PostgreSQL transaction, and the database rejects unbalanced ledger transactions at commit time.

## Assessment sample result

For `POL-1001`, changing the annual premium from `120000` to `144000` cents effective `2026-07-01` produces a prorated adjustment of `12099` cents. Recording the supplied `12099`-cent USD payment reduces the open balance to zero.

## Scope boundary

The payment endpoint only receives and persists normalized JSON describing a payment that already happened elsewhere. It does not call Stripe, PayPal, a bank, or any payment gateway, and it never captures card or bank credentials.
