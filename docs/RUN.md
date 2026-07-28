# Run and Configuration

## Option A: run everything with Docker Compose

Create the local environment file if it does not exist:

```powershell
if (-not (Test-Path .\.env)) {
    Copy-Item .\.env.example .\.env
}
```

Build and start the application and PostgreSQL:

```powershell
docker compose up --build -d
```

Check the service status:

```powershell
docker compose ps
```

Wait until both `db` and `api` report a healthy state.

The API container:

1. waits for PostgreSQL
2. applies pending raw SQL migrations
3. seeds `POL-1001` when it is absent
4. starts the compiled NestJS application

Available URLs:

- Operator UI: `http://localhost:3000`
- API root: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- Health endpoint: `http://localhost:3000/api/health`

Run the supplied assessment scenario:

```powershell
npm.cmd run demo
```

View logs:

```powershell
docker compose logs -f api
```

PostgreSQL logs:

```powershell
docker compose logs -f db
```

Stop containers while retaining database data:

```powershell
docker compose down
```

Remove containers and reset all database data:

```powershell
docker compose down -v
```

## Option B: run NestJS locally and PostgreSQL in Docker

Use this option when developing the application in Windows while keeping PostgreSQL containerized.

### Terminal 1: start PostgreSQL

```powershell
docker compose up -d db
```

Confirm that the database is healthy:

```powershell
docker compose ps
```

### Terminal 2: install and start NestJS

```powershell
if (-not (Test-Path .\.env)) {
    Copy-Item .\.env.example .\.env
}

npm.cmd ci
npm.cmd run db:setup
npm.cmd run start:dev
```

The development server watches backend TypeScript files.

After changing `frontend/app.ts`, rebuild the browser bundle:

```powershell
npm.cmd run build:frontend
```

## Production-style local run

Start PostgreSQL:

```powershell
docker compose up -d db
```

Install the exact dependency tree, configure the database, build, test, and run:

```powershell
if (-not (Test-Path .\.env)) {
    Copy-Item .\.env.example .\.env
}

npm.cmd ci
npm.cmd run db:setup
npm.cmd run verify
npm.cmd run build
npm.cmd test
npm.cmd run start:prod
```

## Configuration variables

| Variable | Default example | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment label |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/pas` | Application PostgreSQL connection |
| `DATABASE_URL_TEST` | `postgresql://postgres:postgres@localhost:5433/pas_test` | Integration-test PostgreSQL connection |
| `DB_POOL_MAX` | `10` | Maximum PostgreSQL connection-pool size |
| `LOG_LEVEL` | `info` | Application log-level setting |
| `API_BASE_URL` | `http://localhost:3000/api` | Optional demo-script API target |

## Database commands

Apply pending migrations:

```powershell
npm.cmd run db:migrate
```

Insert the sample policy when it is absent:

```powershell
npm.cmd run db:seed
```

Run migrations and seed together:

```powershell
npm.cmd run db:setup
```

Migrations are applied in filename order and recorded in `schema_migrations`.

Each migration runs inside its own PostgreSQL transaction. An advisory lock prevents concurrent migration runners from applying the same migration simultaneously.

## Integration-test database

Start the disposable integration-test database:

```powershell
docker compose --profile test up -d db-test
```

Wait until it is healthy:

```powershell
docker compose --profile test ps
```

Run the integration suite:

```powershell
npm.cmd run test:integration
```

Stop the test environment:

```powershell
docker compose --profile test down
```

## Troubleshooting

### PowerShell blocks npm.ps1

When PowerShell reports that `npm.ps1` cannot be loaded because script execution is disabled, use the Windows command wrapper:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
```

Optionally enable signed and locally created scripts for the current Windows user:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Port 5432 is already in use

Stop the local PostgreSQL service or other container that is using the port:

```powershell
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

Alternatively, change the host mapping in `docker-compose.yml` and update `DATABASE_URL` in `.env`.

### Port 3000 is already in use

Find the process using the port:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

For local Node execution, change `PORT` in `.env`.

For Docker Compose, change the host-side port mapping, for example:

```yaml
ports:
  - "3001:3000"
```

The application would then be available at:

```text
http://localhost:3001
```

### Docker Desktop cannot mount or build the project

Move the project to a short local path such as:

```text
C:\dev\baselabs-policy-ledger
```

Avoid deeply nested synchronized folders while troubleshooting.

### Database schema looks stale

Remove the database volume and rebuild:

```powershell
docker compose down -v
docker compose up --build -d
```

### Clean build

Remove generated backend, frontend, test, coverage, and incremental compiler files:

```powershell
if (Test-Path .\dist) {
    Remove-Item .\dist -Recurse -Force
}

if (Test-Path .\dist-test) {
    Remove-Item .\dist-test -Recurse -Force
}

if (Test-Path .\coverage) {
    Remove-Item .\coverage -Recurse -Force
}

if (Test-Path .\public\app.js) {
    Remove-Item .\public\app.js -Force
}

Get-ChildItem `
    -Path . `
    -Recurse `
    -File `
    -Filter "*.tsbuildinfo" |
Where-Object {
    $_.FullName -notmatch "\\node_modules\\"
} |
Remove-Item -Force
```

Rebuild:

```powershell
npm.cmd run build
```

### VS Code displays TypeScript 6 warnings

Confirm the workspace compiler:

```powershell
.\node_modules\.bin\tsc.cmd --version
```

Expected output:

```text
Version 5.8.3
```

In VS Code:

1. Open a TypeScript file.
2. Run `TypeScript: Select TypeScript Version`.
3. Select `Use Workspace Version`.
4. Run `Developer: Reload Window`.

Do not add:

```json
"ignoreDeprecations": "6.0"
```

The project uses TypeScript 5.8.3, where that value is invalid.

### Jest cannot transform files under test

Confirm that the unit and integration configurations use `tsconfig.spec.json`:

```powershell
Select-String `
    -Path .\jest.config.js `
    -Pattern "tsconfig.spec.json"

Select-String `
    -Path .\test\jest-e2e.json `
    -Pattern "tsconfig.spec.json"
```

Both commands must return a match.

Clear the Jest cache:

```powershell
npm.cmd exec jest -- --clearCache
```

Run the tests again:

```powershell
npm.cmd test
```

### Complete local reset

Stop containers and remove volumes:

```powershell
docker compose --profile test down -v --remove-orphans
```

Remove installed dependencies and generated files:

```powershell
if (Test-Path .\node_modules) {
    Remove-Item .\node_modules -Recurse -Force
}

if (Test-Path .\dist) {
    Remove-Item .\dist -Recurse -Force
}

if (Test-Path .\dist-test) {
    Remove-Item .\dist-test -Recurse -Force
}

if (Test-Path .\coverage) {
    Remove-Item .\coverage -Recurse -Force
}

if (Test-Path .\public\app.js) {
    Remove-Item .\public\app.js -Force
}
```

Reinstall and verify:

```powershell
npm.cmd cache verify
npm.cmd ci
npm.cmd run verify
npm.cmd run build
npm.cmd test
```