#!/bin/bash
# =============================================================
# Hesabat — Backup Restore Test Script
# Tests that the latest PostgreSQL backup can actually restore
# Creates a TEMP database, restores, then drops it
# Safe: does NOT touch hesabat_db (production DB)
# =============================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────
DB_NAME="hesabat_db"
TEST_DB="hesabat_restore_test"
PG_BACKUP_DIR="/var/backups/hesabat/postgres"
LOG_FILE="/var/backups/hesabat/restore-test.log"

# ── Helpers ──────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  # Clean up test DB if it exists
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" 2>/dev/null || true
  exit 1
}

mkdir -p "$(dirname "$LOG_FILE")"

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Hesabat restore test started"

# ── 1. Find latest backup ────────────────────────────────────
LATEST=$(find "$PG_BACKUP_DIR" -name "*.sql.gz" | sort | tail -1)

if [ -z "$LATEST" ]; then
  fail "No backup files found in $PG_BACKUP_DIR"
fi

BACKUP_DATE=$(stat -c "%y" "$LATEST" | cut -d' ' -f1)
BACKUP_SIZE=$(du -sh "$LATEST" | cut -f1)
log "Latest backup: $(basename "$LATEST")"
log "  Date: $BACKUP_DATE | Size: $BACKUP_SIZE"

# ── 2. Create temp test database ─────────────────────────────
log "Creating temporary test database: $TEST_DB"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" || fail "Could not drop old test DB"
sudo -u postgres psql -c "CREATE DATABASE $TEST_DB OWNER hesabat;" || fail "Could not create test DB"
log "Test database created ✅"

# ── 3. Restore backup into test DB ──────────────────────────
log "Restoring backup into $TEST_DB ..."
if gunzip -c "$LATEST" | sudo -u postgres psql "$TEST_DB" > /dev/null 2>&1; then
  log "Restore completed ✅"
else
  fail "Restore failed — check the backup file"
fi

# ── 4. Verify key tables exist ───────────────────────────────
log "Verifying key tables in restored DB ..."

TABLES=("companies" "users" "journal_entries" "journal_lines" "accounts" "invoices")
MISSING=()

for TABLE in "${TABLES[@]}"; do
  EXISTS=$(sudo -u postgres psql "$TEST_DB" -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$TABLE';" 2>/dev/null)
  if [ "$EXISTS" = "1" ]; then
    log "  ✅ $TABLE"
  else
    log "  ❌ $TABLE — MISSING"
    MISSING+=("$TABLE")
  fi
done

# ── 5. Row count spot check ──────────────────────────────────
log "Row count spot check ..."
for TABLE in "companies" "users" "accounts"; do
  COUNT=$(sudo -u postgres psql "$TEST_DB" -tAc "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null || echo "N/A")
  log "  $TABLE: $COUNT rows"
done

# ── 6. Drop test database ────────────────────────────────────
log "Cleaning up test database ..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" || true
log "Test database dropped ✅"

# ── 7. Result ────────────────────────────────────────────────
if [ ${#MISSING[@]} -gt 0 ]; then
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "⚠️  RESTORE TEST WARNING"
  log "   Missing tables: ${MISSING[*]}"
  log "   Backup may be incomplete"
  exit 1
else
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "✅ RESTORE TEST PASSED"
  log "   Backup: $(basename "$LATEST")"
  log "   All key tables verified"
  log "   Production DB ($DB_NAME) was NOT touched"
fi
