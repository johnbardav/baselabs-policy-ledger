$ErrorActionPreference = "Stop"
$env:API_BASE_URL = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:3000/api" }
node scripts/demo.mjs
