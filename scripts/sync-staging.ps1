# sync-staging.ps1 — Clone production data to staging
# Requires SUPABASE_PROD_KEY and SUPABASE_STAGING_KEY env vars
$env:SUPABASE_PROD_KEY = $env:SUPABASE_PROD_KEY
$env:SUPABASE_STAGING_KEY = $env:SUPABASE_STAGING_KEY
Write-Host "1/2 Creating auth users..." 
node scripts/migrate-users-full.mjs
Write-Host "2/2 Copying data..." 
node scripts/full-copy.mjs
Write-Host "✅ Sync complete"
