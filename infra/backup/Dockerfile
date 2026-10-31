# Nightly encrypted database backup (Railway cron service "co-backup").
# pg_dump must be at least the server's major version: production runs PostgreSQL 18.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli openssl
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
# R2 rejects the newer default checksums on streamed uploads.
ENV AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    AWS_DEFAULT_REGION=auto
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
