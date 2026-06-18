# sync-staging.ps1 — Clone production data to staging
$env:SUPABASE_PROD_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c"
$env:SUPABASE_STAGING_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdm9ieWR0a29uY2NneWZ4cm13Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTc3NDQ4NywiZXhwIjoyMDk3MzUwNDg3fQ.D5edSvHkZrkf4LPFWeh050KQY5mLmwB0It0ChdA3bTQ"
Write-Host "1/2 Creating auth users..." 
node scripts/migrate-users-full.mjs
Write-Host "2/2 Copying data..." 
node scripts/full-copy.mjs
Write-Host "✅ Sync complete"
