# Submission Checklist

## Repository

- [ ] Generate and commit `package-lock.json` with `npm install`.
- [ ] Replace placeholder Git identity with your own.
- [ ] Confirm `.env` and credentials are not committed.
- [ ] Run `npm run verify`.
- [ ] Run `npm run build`.
- [ ] Run `npm test`.
- [ ] Run PostgreSQL integration tests.
- [ ] Start from a clean checkout with `docker compose up --build`.
- [ ] Run `./scripts/demo.ps1`.
- [ ] Confirm the working tree is clean.
- [ ] Push the repository to GitHub.

## Manual result checks

- [ ] Endorsement delta is `12099` cents.
- [ ] Duplicate endorsement creates no extra event, bill, or ledger transaction.
- [ ] Conflicting endorsement payload under the same key returns 409.
- [ ] USD payment reduces open balance to zero.
- [ ] Duplicate payment creates no extra payment or ledger transaction.
- [ ] EUR payment returns 422 and leaves no partial writes.
- [ ] Every ledger transaction is balanced.
- [ ] History verification is valid with two events.
- [ ] UI shows loading, success, validation, and server-error states.

## Video

Record a five-to-ten-minute walkthrough covering:

- what was built and how to run it
- raw SQL schema and invariants
- transaction boundaries
- proration and rounding
- endorsement and payment idempotency
- double-entry ledger balance
- minimal frontend workflow
- one rejected request
- AI usage and manual verification
- improvements with more time

## Final message to recruiter

Share:

- GitHub repository link
- walkthrough video link
- brief note confirming the project was run and tested on your machine
