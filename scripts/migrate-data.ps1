# ── Data Migration: Old DB → New DB ────────────────────────
# Run: pwsh -File scripts/migrate-data.ps1
param(
  [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

$oldKey = $env:OLD_SUPABASE_KEY
$newKey = $env:NEW_SUPABASE_KEY
$oldUrl = $env:OLD_SUPABASE_URL + "/rest/v1"
$newUrl = $env:NEW_SUPABASE_URL + "/rest/v1"
$gameId = "00000000-0000-0000-0000-000000000001"

$oldHeaders = @{ apikey = $oldKey; Authorization = "Bearer $oldKey" }
$newHeaders = @{ apikey = $newKey; Authorization = "Bearer $newKey"; "Content-Type" = "application/json"; Prefer = "return=minimal" }

function Get-Old($table, $select = "*", $filter = "") {
  $uri = "$oldUrl/$table`?select=$select&limit=50000"
  if ($filter) { $uri += "&$filter" }
  Write-Host "  Fetching $table..." -NoNewline
  $rows = @(Invoke-RestMethod -Uri $uri -Headers $oldHeaders)
  Write-Host " $($rows.Count) rows" -ForegroundColor Green
  # Convert to hashtables so we can add/modify properties
  return @($rows | ForEach-Object {
    $h = @{}
    $_.PSObject.Properties | ForEach-Object { $h[$_.Name] = $_.Value }
    $h
  })
}

function Insert-New($table, $rows) {
  if ($rows.Count -eq 0) { Write-Host "  Skipping $table (0 rows)" -ForegroundColor Gray; return }
  Write-Host "  Inserting $($rows.Count) rows into $table..." -NoNewline
  try {
    $body = $rows | ConvertTo-Json -Depth 10
    if ($rows.Count -eq 1) { $body = "[$body]" }
    $null = Invoke-RestMethod -Uri "$newUrl/$table" -Method Post -Headers $newHeaders -Body $body
    Write-Host " OK" -ForegroundColor Green
  } catch {
    Write-Host " FAILED: $_" -ForegroundColor Red
  }
}

# ── GMT+8 → UTC schedule conversion ─────────────────────────
function Convert-ScheduleToUtc($schedule) {
  if (-not $schedule -or $schedule -isnot [array]) { return $schedule }
  $converted = @()
  foreach ($slot in $schedule) {
    $h = [int]($slot.time.Split(":")[0])
    $m = [int]($slot.time.Split(":")[1])
    $totalMin = $h * 60 + $m - 480  # subtract 8 hours
    if ($totalMin -lt 0) { $totalMin += 1440; $day = ($slot.day + 6) % 7 }
    else { $day = $slot.day }
    $newH = [Math]::Floor($totalMin / 60)
    $newM = $totalMin % 60
    $converted += @{ day = $day; time = "{0:D2}:{1:D2}" -f $newH, $newM }
  }
  return $converted
}

Write-Host "`n=== DATA MIGRATION ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host "DRY RUN - only fetching, not inserting" -ForegroundColor Yellow }

# ── 1. servers ──────────────────────────────────────────────
$servers = Get-Old "servers" "id,name,owner_id,invite_code,discord_webhook_url,viewer_key,timezone,notification_prefix,viewer_can_edit,viewer_can_mark_died,created_at,deleted_at"
$servers | ForEach-Object { $_['game_id'] = $gameId }
if (-not $DryRun) { Insert-New "servers" $servers }

# ── 2. server_members ───────────────────────────────────────
$sm = Get-Old "server_members"
if (-not $DryRun) { Insert-New "server_members" $sm }

# ── 3. guilds ───────────────────────────────────────────────
$guilds = Get-Old "guilds"
if (-not $DryRun) { Insert-New "guilds" $guilds }

# ── 4. members ──────────────────────────────────────────────
$members = Get-Old "members"
if (-not $DryRun) { Insert-New "members" $members }

# ── 5. bosses — with schedule conversion ────────────────────
$bosses = Get-Old "bosses" "id,server_id,name,spawn_type,respawn_hours,schedule,boss_points,rotation_adjustment,rotation_counter,created_at,updated_at"
Write-Host "  Converting boss schedules GMT+8 → UTC..."
$convertedCount = 0
foreach ($b in $bosses) {
  # Add new columns with defaults
  $b['template_id'] = $null
  $b['is_recurring'] = $true
  $b['is_enabled'] = $true
  $b['is_custom'] = $false
  $b['points'] = if ($b['boss_points']) { $b['boss_points'] } else { 1 }
  $b['has_salary'] = $false
  $b['category'] = $null
  $b['tags'] = @()
  $b['image_url'] = $null
  # Convert schedule if present
  if ($b['spawn_type'] -eq "fixed_schedule" -and $b['schedule']) {
    $b['schedule'] = Convert-ScheduleToUtc $b['schedule']
    $convertedCount++
  }
  # Remove old column that doesn't exist in new schema
  $b.Remove('boss_points')
}
Write-Host "  Converted $convertedCount schedule bosses to UTC"
if (-not $DryRun) { Insert-New "bosses" $bosses }

# ── 6. death_records — preserve IDs ─────────────────────────
$deaths = Get-Old "death_records"
foreach ($d in $deaths) { $d['is_final'] = $false }  # add new column
if (-not $DryRun) { Insert-New "death_records" $deaths }

# ── 7. attendance_records ───────────────────────────────────
$att = Get-Old "attendance_records"
if (-not $DryRun) { Insert-New "attendance_records" $att }

# ── 8. boss_guilds ──────────────────────────────────────────
$bg = Get-Old "boss_guilds"
if (-not $DryRun) { Insert-New "boss_guilds" $bg }

# ── 9. point_adjustments ────────────────────────────────────
$pa = Get-Old "point_adjustments"
if (-not $DryRun) { Insert-New "point_adjustments" $pa }

# ── 10. point_rules ─────────────────────────────────────────
$pr = Get-Old "point_rules"
if (-not $DryRun) { Insert-New "point_rules" $pr }

# ── 11. leaderboard_snapshots ───────────────────────────────
$ls = Get-Old "leaderboard_snapshots"
if (-not $DryRun) { Insert-New "leaderboard_snapshots" $ls }

# ── 12. app_settings ────────────────────────────────────────
$as = Get-Old "app_settings"
if (-not $DryRun) { Insert-New "app_settings" $as }

# ── 13. moderator_permissions ───────────────────────────────
$mp = Get-Old "moderator_permissions"
if (-not $DryRun) { Insert-New "moderator_permissions" $mp }

# ── 14. discord_configs ─────────────────────────────────────
$dc = Get-Old "discord_configs"
if (-not $DryRun) { Insert-New "discord_configs" $dc }

# ── 15. spawn_notifications ─────────────────────────────────
$sn = Get-Old "spawn_notifications"
if (-not $DryRun) { Insert-New "spawn_notifications" $sn }

# ── 16. boss_spawn_overrides ────────────────────────────────
$bso = Get-Old "boss_spawn_overrides"
if (-not $DryRun) { Insert-New "boss_spawn_overrides" $bso }

# ── Post-migration: backfill template_id ────────────────────
Write-Host "`n=== POST-MIGRATION BACKFILLS ===" -ForegroundColor Cyan
$backfillSql = @"
-- Match bosses to templates by name
UPDATE bosses b SET template_id = bt.id
FROM boss_templates bt
WHERE b.name = bt.name AND bt.game_id = '$gameId' AND b.template_id IS NULL;

-- Mark unmatched bosses as custom
UPDATE bosses SET is_custom = true WHERE template_id IS NULL;
"@
Write-Host $backfillSql
Write-Host "`nRun these SQL commands in the Supabase SQL Editor for project cjuacehmienztxrhwnlg" -ForegroundColor Yellow

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
