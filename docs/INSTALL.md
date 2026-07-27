# Installation

This guide is written for Windows 11 Pro x64.

## Recommended path: Docker Desktop with WSL 2

### 1. Install prerequisites

Install:

- Git for Windows
- Docker Desktop using the WSL 2 backend
- Optional: Node.js 22 LTS for local development outside containers

From an elevated PowerShell terminal, enable WSL 2 when needed:

```powershell
wsl --install
```

Restart Windows after the command if requested. Start Docker Desktop and wait until the engine reports that it is running.

### 2. Verify the tools

```powershell
git --version
docker version
docker compose version
```

For local Node development, also verify:

```powershell
node --version
npm --version
```

NestJS 11 requires Node.js 20 or newer. The supplied Dockerfile uses Node.js 22.

### 3. Extract and enter the project

Use a short local path to reduce Windows path and file-watcher issues, for example:

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
Expand-Archive .\baselabs-policy-ledger.zip C:\dev
Set-Location C:\dev\baselabs-policy-ledger
```

Confirm that the current directory contains `package.json` and `docker-compose.yml`.

### 4. Create local configuration

```powershell
Copy-Item .env.example .env
```

The default values work with Docker Compose. Do not commit `.env`.

## Local Node installation path

Use this path when running NestJS on Windows while PostgreSQL remains in Docker.

```powershell
npm install
docker compose up -d db
npm run db:setup
npm run build
```

`npm install` creates `package-lock.json` on the first installation. Review and commit that generated lockfile before submission for reproducible installs.

## Installation validation

Run the structural check:

```powershell
npm run verify
```

Expected output:

```text
Project structure verified: required files exist and no ORM references were found.
```
