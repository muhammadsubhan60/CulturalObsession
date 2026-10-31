#!/bin/sh
# Dumps the database, encrypts it with BACKUP_PASSPHRASE (AES-256, PBKDF2) and uploads it to a
# private S3/R2 bucket, then deletes backups older than BACKUP_RETENTION_DAYS (default 30).
# Required env: DATABASE_URL, BACKUP_BUCKET, BACKUP_PASSPHRASE, S3_ENDPOINT,
#               AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
set -eu
set -o pipefail

: "${DATABASE_URL:?}" "${BACKUP_BUCKET:?}" "${BACKUP_PASSPHRASE:?}" "${S3_ENDPOINT:?}"
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
prefix="${BACKUP_PREFIX:-postgres}"
days="${BACKUP_RETENTION_DAYS:-30}"
s3() { aws s3 --endpoint-url "$S3_ENDPOINT" "$@"; }

stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
key="$prefix/co-$stamp.dump.enc"

# Prisma-style URLs carry ?schema=..., which libpq rejects.
db_url=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')

if ! pg_dump --format=custom --no-owner --no-privileges "$db_url" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
  | s3 cp - "s3://$BACKUP_BUCKET/$key" --only-show-errors; then
  # Never leave a half-written file behind for "latest" to pick up.
  s3 rm "s3://$BACKUP_BUCKET/$key" --only-show-errors || true
  echo "backup FAILED: dump or upload error" >&2
  exit 1
fi

size=$(s3 ls "s3://$BACKUP_BUCKET/$key" | awk '{print $3}')
if [ -z "$size" ] || [ "$size" -lt 1024 ]; then
  echo "backup FAILED: $key is missing or too small (${size:-0} bytes)" >&2
  exit 1
fi
echo "backup ok: $key ($size bytes)"

# Retention: keys sort by their UTC timestamp, so a string compare finds the old ones.
cutoff=$(date -u -d "@$(( $(date +%s) - days * 86400 ))" +%Y-%m-%dT%H%M%SZ)
s3 ls "s3://$BACKUP_BUCKET/$prefix/" | awk '{print $4}' | while read -r name; do
  case "$name" in co-*.dump.enc) ;; *) continue ;; esac
  ts=${name#co-}
  ts=${ts%.dump.enc}
  if [ "$ts" \< "$cutoff" ]; then
    s3 rm "s3://$BACKUP_BUCKET/$prefix/$name" --only-show-errors
    echo "deleted old backup: $name"
  fi
done
