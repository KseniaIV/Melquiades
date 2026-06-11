# Melquíades database setup for a native Windows PostgreSQL.
# Usage:  .\setup.ps1            (defaults: port 5432, user postgres)
#         .\setup.ps1 -Port 5433 -User postgres
# Re-running is safe: schema and seed are idempotent.
param(
    [int]$Port = 5432,
    [string]$User = "postgres",
    [string]$Db = "melquiades"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Checking PostgreSQL on port $Port..."
& psql -U $User -p $Port -d postgres -c "SELECT version();" | Out-Null

$exists = & psql -U $User -p $Port -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Db'"
if ($exists -ne "1") {
    Write-Host "==> Creating database '$Db'..."
    & createdb -U $User -p $Port $Db
} else {
    Write-Host "==> Database '$Db' already exists."
}

Write-Host "==> Applying schema..."
& psql -U $User -p $Port -d $Db -v ON_ERROR_STOP=1 -f "$PSScriptRoot\schema.sql"

Write-Host "==> Seeding starter snippets..."
& psql -U $User -p $Port -d $Db -v ON_ERROR_STOP=1 -f "$PSScriptRoot\seed.sql"

$count = & psql -U $User -p $Port -d $Db -tAc "SELECT count(*) FROM snippets"
Write-Host "==> Done. $count snippets in database."
Write-Host ""
Write-Host "Set the connection string, then run the server:"
Write-Host "  `$env:DATABASE_URL = `"postgres://${User}:<password>@localhost:$Port/$Db`?sslmode=disable`""
Write-Host "  go run ."
