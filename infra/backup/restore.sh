#!/bin/sh
# Restores one encrypted backup into TARGET_DATABASE_URL (an EMPTY database, never production).
#   restore.sh postgres/co-2026-11-01T213000Z.dump.enc     (or "latest")
# Required env: TARGET_DATABASE_URL, BACKUP_BUCKET, BACKUP_PASSPHRASE, S3_ENDPOINT, AWS_* keys.
set -eu
set -o pipefail

: "${TARGET_DATABASE_URL:?}" "${BACKUP_BUCKET:?}" "${BACKUP_PASSPHRASE:?}" "${S3_ENDPOINT:?}"
if [ -n "${DATABASE_URL:-}" ] && [ "$TARGET_DATABASE_URL" = "$DATABASE_URL" ]; then
  echo "refusing to restore over DATABASE_URL" >&2
  exit 1
fi
prefix="${BACKUP_PREFIX:-postgres}"
s3() { aws s3 --endpoint-url "$S3_ENDPOINT" "$@"; }

key="${1:?usage: restore.sh <key>|latest}"
if [ "$key" = latest ]; then
  key="$prefix/$(s3 ls "s3://$BACKUP_BUCKET/$prefix/" | awk '{print $4}' | grep '^co-.*\.dump\.enc$' | sort | tail -1)"
fi
echo "restoring $key"
target=$(printf '%s' "$TARGET_DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')

s3 cp "s3://$BACKUP_BUCKET/$key" - --only-show-errors \
  | openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  | pg_restore --no-owner --no-privileges --exit-on-error --dbname "$target"

psql "$target" -tAc 'SELECT count(*) || '"' orders, '"' || (SELECT count(*) FROM "Product") || '"' products'"' FROM "Order"'
