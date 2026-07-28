# Installation

This guide is written for Windows 11 Pro x64.

## 1. Install prerequisites

Install:

- Git for Windows
- Docker Desktop using the WSL 2 backend
- Node.js 22 LTS x64

Node.js 20 or newer is supported. Node.js 22 is recommended because it matches the Docker image and CI workflow.

From an elevated PowerShell terminal, enable WSL 2 when needed:

```powershell
wsl --install
```

Restart Windows if requested. Start Docker Desktop and wait until the Docker engine is running.

## 2. Verify prerequisites

Open a new PowerShell terminal:

```powershell
git --version
docker version
docker compose version
node --version
npm.cmd --version
```

Confirm the Node.js architecture:

```powershell
node -p "process.arch"
```

Expected value on Windows x64:

```text
x64
```

## 3. Clone the repository

Use a short local path when possible:

```powershell
Set-Location C:\Users\User\Documents\GitHub

git clone https://github.com/johnbardav/baselabs-policy-ledger.git

Set-Location .\baselabs-policy-ledger
```

Confirm that you are in the repository root:

```powershell
git rev-parse --show-toplevel

Test-Path .\package.json
Test-Path .\package-lock.json
Test-Path .\docker-compose.yml
Test-Path .\src
Test-Path .\migrations
```

Every `Test-Path` command should return `True`.

## 4. Create local configuration

```powershell
Copy-Item .\.env.example .\.env
```

Do not commit `.env`.

The default configuration uses:

- application database: `localhost:5432`
- integration-test database: `localhost:5433`
- application port: `3000`

## 5. Install the exact dependency tree

The repository already includes `package-lock.json`. Use `npm ci` rather than regenerating the dependency tree:

```powershell
npm.cmd ci
```

Do not use `--force` or `--legacy-peer-deps`.

Confirm the important versions:

```powershell
.\node_modules\.bin\tsc.cmd --version
npm.cmd ls jest ts-jest @types/jest
```

Expected versions:

```text
TypeScript 5.8.3
Jest 29
ts-jest 29
@types/jest 29
```

## 6. Validate the installation

```powershell
npm.cmd run verify
npm.cmd run build
npm.cmd test
```

Expected unit-test result:

```text
Test Suites: 3 passed, 3 total
```

## 7. Validate PostgreSQL integration

Start the disposable test database:

```powershell
docker compose --profile test up -d db-test
```

Check its status:

```powershell
docker compose --profile test ps
```

Wait until `db-test` reports `healthy`, then run:

```powershell
npm.cmd run test:integration
```

Stop the test environment:

```powershell
docker compose --profile test down
```

## 8. Validate the complete Docker environment

```powershell
docker compose up --build -d
docker compose ps
```

Wait until both `db` and `api` are healthy.

Open:

- Operator UI: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- Health endpoint: `http://localhost:3000/api/health`

Run the assessment scenario:

```powershell
npm.cmd run demo
```

Stop the environment while retaining database data:

```powershell
docker compose down
```

Reset all local database data:

```powershell
docker compose down -v
```

## PowerShell execution-policy issue

If PowerShell reports that `npm.ps1` cannot be loaded, continue using `npm.cmd`:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
```

Optionally enable locally created scripts for the current Windows user:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Clean reinstall

Use this sequence after dependency or compiler changes:

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

Get-ChildItem `
    -Path . `
    -Recurse `
    -File `
    -Filter "*.tsbuildinfo" |
Where-Object {
    $_.FullName -notmatch "\\node_modules\\"
} |
Remove-Item -Force

npm.cmd cache verify
npm.cmd ci
```

Do not delete `package-lock.json` during a normal clean installation.
