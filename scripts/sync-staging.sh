#!/usr/bin/env zsh
# sync-staging.sh — Clone production data to staging (zsh/bash version of sync-staging.ps1)
#
# Reads SUPABASE_SERVICE_ROLE_KEY from .env.production and .env.staging
# Fill in those files first:
#   .env.production → SUPABASE_SERVICE_ROLE_KEY
#   .env.staging    → SUPABASE_SERVICE_ROLE_KEY
#
# Get keys from Supabase Dashboard → Project Settings → API → service_role key
#   Production: https://supabase.com/dashboard/project/cjuacehmienztxrhwnlg/settings/api
#   Staging:    https://supabase.com/dashboard/project/aavobydtkonccgyfxrmw/settings/api

set -e

prod_key=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.production 2>/dev/null | cut -d= -f2-)
staging_key=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.staging 2>/dev/null | cut -d= -f2-)

if [[ -z "$prod_key" || "$prod_key" == "<your-production-service-role-key>" ]]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not set in .env.production" >&2
  echo "Get it from: https://supabase.com/dashboard/project/cjuacehmienztxrhwnlg/settings/api" >&2
  exit 1
fi
if [[ -z "$staging_key" || "$staging_key" == "<your-staging-service-role-key>" ]]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not set in .env.staging" >&2
  echo "Get it from: https://supabase.com/dashboard/project/aavobydtkonccgyfxrmw/settings/api" >&2
  exit 1
fi

export SUPABASE_PROD_KEY="$prod_key"
export SUPABASE_STAGING_KEY="$staging_key"

echo "Production: cjuacehmienztxrhwnlg.supabase.co"
echo "Staging:    aavobydtkonccgyfxrmw.supabase.co"
echo ""

echo "1/2 Creating auth users..."
node scripts/migrate-users-full.mjs
echo "2/2 Copying data..."
node scripts/full-copy.mjs
echo "✅ Sync complete"
