# Thirty-Minute Commit Plan

This is a six-hour pacing plan for Monday, July 27, 2026 in `America/Bogota`. The first target is 3:30 PM, followed by one logical milestone every 30 minutes. The file groups do not overlap, so they can be staged directly from the final archive in this order.

Commit only after reviewing and validating the milestone. Do not backdate or fabricate work.

## Initial repository setup

```powershell
git init
git branch -M main
git config user.name "Your Name"
git config user.email "your.email@example.com"
npm install
```

The first `npm install` creates `package-lock.json`; include it in the first commit.

## 3:30 PM — project foundation

```text
chore: initialize NestJS TypeScript project
```

```powershell
git add package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json tsconfig.frontend.json jest.config.js .gitignore .dockerignore .env.example
git commit -m "chore: initialize NestJS TypeScript project"
```

Review the npm scripts and confirm that no ORM dependency is present.

## 4:00 PM — raw SQL schema and migration tooling

```text
feat(db): add raw SQL schema and migration runner
```

```powershell
git add migrations scripts/load-env.mjs scripts/migrate.mjs scripts/wait-for-db.mjs docker-compose.yml
git commit -m "feat(db): add raw SQL schema and migration runner"
```

Review every table, foreign key, unique constraint, deferred ledger trigger, and append-only trigger.

## 4:30 PM — database access, health, and seed

```text
feat(core): add database access, health check, and sample seed
```

```powershell
git add src/common/config src/common/database src/health scripts/seed.mjs data/policy.json
git commit -m "feat(core): add database access, health check, and sample seed"
```

Run PostgreSQL, apply migrations, seed `POL-1001`, and query the policy row.

## 5:00 PM — deterministic financial utilities

```text
feat(finance): add integer proration and canonical hashing
```

```powershell
git add src/common/utils/canonical-json.ts src/common/utils/date.ts src/common/utils/hash.ts src/common/utils/id-generator.ts src/common/utils/money.ts test/unit/proration.spec.ts test/unit/canonical-json.spec.ts
git commit -m "feat(finance): add integer proration and canonical hashing"
```

Verify by hand that `24000 × 184 / 365` rounds to `12099` cents.

## 5:30 PM — policy contracts and validation

```text
feat(policy): define policy models and request validation
```

```powershell
git add src/policies/types.ts src/policies/dto
git commit -m "feat(policy): define policy models and request validation"
```

Review integer-cent limits, date shape, timestamp shape, currency, unknown-field behavior, and idempotency-key rules.

## 6:00 PM — raw SQL repository

```text
feat(policy): add transactional raw SQL repository
```

```powershell
git add src/policies/policies.repository.ts
git commit -m "feat(policy): add transactional raw SQL repository"
```

Trace the SQL for policy locks, idempotency claims, event appends, billing, payments, balance calculation, and ledger reads.

## 6:30 PM — endorsement, payment, ledger, and history logic

```text
feat(policy): implement idempotent financial workflows
```

```powershell
git add src/policies/policies.service.ts src/policies/history.ts test/unit/history.spec.ts
git commit -m "feat(policy): implement idempotent financial workflows"
```

Explain both transaction paths, positive and negative endorsement postings, duplicate handling, wrong-currency rollback, and history verification.

## 7:00 PM — REST API, errors, and OpenAPI

```text
feat(api): expose documented policy endpoints
```

```powershell
git add src/policies/policies.controller.ts src/policies/policies.module.ts src/common/exceptions src/common/middleware src/app.module.ts src/main.ts requests
git commit -m "feat(api): expose documented policy endpoints"
```

Start the API, open Swagger, and test representative 400, 404, 409, and 422 responses.

## 7:30 PM — minimal operator frontend

```text
feat(ui): add policy operations console
```

```powershell
git add frontend public
git commit -m "feat(ui): add policy operations console"
```

Load a policy and exercise both forms. Verify loading, success, validation-error, and server-error states.

## 8:00 PM — PostgreSQL integration coverage

```text
test: cover financial workflow and database invariants
```

```powershell
git add test/integration test/jest-e2e.json
git commit -m "test: cover financial workflow and database invariants"
```

Run the test database and verify duplicate delivery, conflict, wrong currency, balance, history, unbalanced-ledger rejection, and append-only rejection.

## 8:30 PM — container build, demo, and CI

```text
chore: add container runtime demo and CI
```

```powershell
git add Dockerfile .github scripts/demo.mjs scripts/demo.ps1 data/events.json data/business-rules.txt
git commit -m "chore: add container runtime demo and CI"
```

Build the image, start the full stack, and run `./scripts/demo.ps1`.

## 9:00 PM — final documentation and submission checks

```text
docs: finalize assessment and operations guide
```

```powershell
git add README.md docs scripts/verify-project.mjs
git commit -m "docs: finalize assessment and operations guide"
```

Rehearse the walkthrough and complete the submission checklist.

## Final repository checks

```powershell
git status
git log --oneline --decorate --graph
npm run verify
npm run build
npm test
docker compose --profile test up -d db-test
npm run test:integration
docker compose --profile test down
docker compose up --build
./scripts/demo.ps1
```

The final working tree should be clean before pushing to GitHub.
