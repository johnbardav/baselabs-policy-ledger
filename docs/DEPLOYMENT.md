# Deployment

Production deployment is outside the assessment's required scope, but the project is container-ready.

## Build the image

```powershell
docker build -t baselabs-policy-ledger:1.0.0 .
```

## Runtime contract

The container requires:

- a reachable PostgreSQL database
- `DATABASE_URL`
- an exposed HTTP port matching `PORT`

At startup it:

1. waits for PostgreSQL
2. applies pending migrations
3. seeds the sample policy only when absent
4. starts the compiled NestJS application

## Example container run

```powershell
docker run --rm `
  -p 3000:3000 `
  -e PORT=3000 `
  -e DATABASE_URL="postgresql://user:password@host:5432/pas" `
  baselabs-policy-ledger:1.0.0
```

## Deployment checks

- `GET /api/health` returns HTTP 200.
- Database migrations complete before traffic is accepted.
- The platform keeps at least one recent PostgreSQL backup.
- Secrets are injected by the platform and are never baked into the image.
- Application logs are collected centrally.
- Alerts cover elevated 5xx responses, health failures, database saturation, and ledger/history verification failures.

## Horizontal scaling

The API is stateless. Multiple instances can share PostgreSQL. Idempotency uniqueness, policy row locks, and database transactions protect concurrent writes across instances.

For a larger production system, migrations should run as a dedicated release job rather than from every application replica.
