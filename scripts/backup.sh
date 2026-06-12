#!/bin/bash
# =============================================================
# Hesabat — Daily Backup Script
# Runs at 2:00 AM via cron
# Backs up: PostgreSQL DB + uploads directory
# Retention: 7 days (Beta) — increase to 30 for production
# =============================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────
DB_NAME="hesabat_db"
DB_USER="hesabat"
BACKUP_ROOT="/var/backups/hesabat"
PG_BACKUP_DIR="$BACKUP_ROOT/postgres"
UPLOADS_BACKUP_DIR="$BACKUP_ROOT/uploads"
UPLOADS_SRC="/var/www/hesabat-uploads"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$BACKUP_ROOT/backup.log"

# ── Helpers ──────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# ── Setup dirs ───────────────────────────────────────────────
mkdir -p "$PG_BACKUP_DIR" "$UPLOADS_BACKUP_DIR"

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Hesabat backup started — $TIMESTAMP"

# ── 1. PostgreSQL dump ───────────────────────────────────────
PG_FILE="$PG_BACKUP_DIR/hesabat_${TIMESTAMP}.sql.gz"

log "Dumping PostgreSQL database: $DB_NAME"
if sudo -u postgres pg_dump "$DB_NAME" | gzip > "$PG_FILE"; then
  PG_SIZE=$(du -sh "$PG_FILE" | cut -f1)
  log "PostgreSQL backup OK — $PG_FILE ($PG_SIZE)"
else
  fail "pg_dump failed for $DB_NAME"
fi

# Verify the dump is not empty
if [ ! -s "$PG_FILE" ]; then
  fail "Backup file is empty: $PG_FILE"
fi

# ── 2. Uploads backup ────────────────────────────────────────
UPLOADS_FILE="$UPLOADS_BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"

if [ -d "$UPLOADS_SRC" ]; then
  log "Backing up uploads: $UPLOADS_SRC"
  tar -czf "$UPLOADS_FILE" -C "$(dirname "$UPLOADS_SRC")" "$(basename "$UPLOADS_SRC")"
  UPLOADS_SIZE=$(du -sh "$UPLOADS_FILE" | cut -f1)
  log "Uploads backup OK — $UPLOADS_FILE ($UPLOADS_SIZE)"
else
  log "Uploads dir not found ($UPLOADS_SRC) — skipping uploads backup"
fi

# ── 3. Rotation — delete backups older than RETENTION_DAYS ───
log "Running rotation — keeping last $RETENTION_DAYS days"

DELETED_PG=0
while IFS= read -r -d '' f; do
  rm -f "$f"
  log "  Deleted old PG backup: $(basename "$f")"
  DELETED_PG=$((DELETED_PG + 1))
done < <(find "$PG_BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -print0)

DELETED_UL=0
while IFS= read -r -d '' f; do
  rm -f "$f"
  log "  Deleted old uploads backup: $(basename "$f")"
  DELETED_UL=$((DELETED_UL + 1))
done < <(find "$UPLOADS_BACKUP_DIR" -name "*.tar.gz" -mtime +"$RETENTION_DAYS" -print0)

log "Rotation done — removed $DELETED_PG PG backup(s), $DELETED_UL uploads backup(s)"

# ── 4. Summary ───────────────────────────────────────────────
PG_COUNT=$(find "$PG_BACKUP_DIR" -name "*.sql.gz" | wc -l)
UL_COUNT=$(find "$UPLOADS_BACKUP_DIR" -name "*.tar.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_ROOT" | cut -f1)

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Backup complete ✅"
log "  PG backups:      $PG_COUNT file(s) in $PG_BACKUP_DIR"
log "  Uploads backups: $UL_COUNT file(s) in $UPLOADS_BACKUP_DIR"
log "  Total size:      $TOTAL_SIZE"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
