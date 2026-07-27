# AI Usage and Manual Verification

## How AI was used

AI assistance was used to accelerate:

- initial project scaffolding
- review of the assessment checklist
- raw SQL schema and migration drafting
- NestJS endpoint and validation drafting
- test-case generation
- documentation structure
- review of edge cases such as negative proration, concurrent idempotency, and atomic currency rejection

## What must be verified manually before submission

The candidate should personally run and understand every item below:

- install dependencies and commit the generated lockfile
- build the backend and frontend
- apply migrations to a clean PostgreSQL database
- inspect every table, constraint, and trigger
- run unit and integration tests
- execute the supplied sample sequence
- verify the `12099`-cent calculation by hand
- inspect the debit and credit entries for both mutation types
- replay each idempotency key and confirm no duplicate financial rows
- submit a conflicting payload and explain the HTTP 409
- submit the wrong-currency payment and verify atomic rollback
- explain the canonical event payload and hash algorithm
- make at least one small code change without AI assistance

## Candidate verification note

Suggested submission wording:

> I used AI as a development assistant for scaffolding, test ideas, and documentation review. I manually reviewed the SQL, transaction boundaries, proration arithmetic, idempotency behavior, ledger postings, history verification, and failure paths. I ran the application and tests locally and can explain and modify the submitted code.

Do not claim verification that was not actually performed. The assessment explicitly permits AI but makes the candidate responsible for the final code.
