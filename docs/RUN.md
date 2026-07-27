# Run and Configuration

## Option A: run everything with Docker Compose

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The API container waits for PostgreSQL, applies pending SQL migrations, seeds `POL-1001` if it is absent, and starts NestJS.

Available endpoints:

- UI: `http://localhost:3000`
- API root: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- Health: `http://localhost:3000/api/health`

Run the sample sequence:

```powershell
./scripts/demo.ps1
```

View logs:

```powershell
docker compose logs -f api
docker compose logs -f db
```

Stop containers while retaining data:

```powershell
docker compose down
```

Reset all local database data:

```powershell
docker compose down -v
```

## Option B: run NestJS locally and PostgreSQL in Docker

Terminal 1:

```powershell
docker compose up -d db
```

Terminal 2:

```powershell
Copy-Item .env.example .env
npm install
npm run db:setup
npm run start:dev
```

The development server watches backend TypeScript files. Re-run `npm run build:frontend` after changing `frontend/app.ts`.

## Production-style local run

```powershell
npm install
npm run db:setup
npm run build
npm run start:prod
```

## Configuration variables

| Variable | Default example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment label |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/pas` | PostgreSQL connection string |
| `DATABASE_URL_TEST` | `postgresql://postgres:postgres@localhost:5433/pas_test` | Integration-test database |
| `DB_POOL_MAX` | `10` | Maximum PostgreSQL pool size |
| `LOG_LEVEL` | `info` | Reserved application log level |
| `API_BASE_URL` | `http://localhost:3000/api` | Optional demo-script target |

## Database commands

```powershell
npm run db:migrate
npm run db:seed
npm run db:setup
```

Migrations are applied in filename order and recorded in `schema_migrations`. Each migration runs in its own database transaction.

## Troubleshooting

### Port 5432 is already in use

Stop the other PostgreSQL instance or change the host mapping in `docker-compose.yml` and update `DATABASE_URL`.

### Port 3000 is already in use

Change `PORT` in `.env` for local Node execution, or change the Compose host mapping from `3000:3000` to another host port such as `3001:3000`.

### Docker Desktop cannot mount or build from the project directory

Move the project to a short path such as `C:\dev\baselabs-policy-ledger`. Avoid deeply nested synchronized folders while troubleshooting.

### Database schema looks stale

```powershell
docker compose down -v
docker compose up --build
```
