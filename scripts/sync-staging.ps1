# sync-staging.ps1 — Clone production data to staging
#
# Reads SUPABASE_SERVICE_ROLE_KEY from .env.production and .env.staging
# Fill in those files first:
#   .env.production → SUPABASE_SERVICE_ROLE_KEY
#   .env.staging    → SUPABASE_SERVICE_ROLE_KEY
#
# Get keys from Supabase Dashboard → Project Settings → API → service_role key
#   Production: https://supabase.com/dashboard/project/cjuacehmienztxrhwnlg/settings/api
#   Staging:    https://supabase.com/dashboard/project/aavobydtkonccgyfxrmw/settings/api

$prodKey = (Select-String -Path ".env.production" -Pattern '^SUPABASE_SERVICE_ROLE_KEY=(.+)$').Matches.Groups[1].Value
$stagingKey = (Select-String -Path ".env.staging" -Pattern '^SUPABASE_SERVICE_ROLE_KEY=(.+)$').Matches.Groups[1].Value

if (-not $prodKey -or $prodKey -eq '<your-production-service-role-key>') {
  Write-Error "SUPABASE_SERVICE_ROLE_KEY not set in .env.production"
  Write-Error "Get it from: https://supabase.com/dashboard/project/cjuacehmienztxrhwnlg/settings/api"
  exit 1
}
if (-not $stagingKey -or $stagingKey -eq '<your-staging-service-role-key>') {
  Write-Error "SUPABASE_SERVICE_ROLE_KEY not set in .env.staging"
  Write-Error "Get it from: https://supabase.com/dashboard/project/aavobydtkonccgyfxrmw/settings/api"
  exit 1
}

$env:SUPABASE_PROD_KEY = $prodKey
$env:SUPABASE_STAGING_KEY = $stagingKey

Write-Host "Production: cjuacehmienztxrhwnlg.supabase.co"
Write-Host "Staging:    aavobydtkonccgyfxrmw.supabase.co"
Write-Host ""

Write-Host "1/2 Creating auth users..." 
node scripts/migrate-users-full.mjs
Write-Host "2/2 Copying data..." 
node scripts/full-copy.mjs
Write-Host "✅ Sync complete"
