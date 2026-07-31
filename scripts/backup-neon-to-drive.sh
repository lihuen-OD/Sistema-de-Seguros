#!/usr/bin/env bash

set -Eeuo pipefail
set +x
umask 077

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1"
}

require_variable() {
  local variable_name="$1"
  [[ -n "${!variable_name:-}" ]] || fail "Falta la variable requerida: ${variable_name}"
}

require_variable BACKUP_DATABASE_URL
require_variable GDRIVE_FOLDER_ID
require_variable GDRIVE_SERVICE_ACCOUNT_JSON

readonly BACKUP_TIER="${BACKUP_TIER:-daily}"
case "$BACKUP_TIER" in
  daily|weekly|monthly|pre-migration) ;;
  *) fail "BACKUP_TIER debe ser daily, weekly, monthly o pre-migration" ;;
esac

require_command gzip
require_command rclone
require_command sha256sum

if [[ -z "${PG_DUMP_DOCKER_IMAGE:-}" ]]; then
  require_command pg_dump
else
  require_command docker
  [[ "$PG_DUMP_DOCKER_IMAGE" =~ ^postgres:[0-9]+([.][0-9]+)?-bookworm$ ]] ||
    fail "PG_DUMP_DOCKER_IMAGE debe usar una imagen oficial como postgres:17-bookworm"
fi

readonly TIMESTAMP="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
readonly BACKUP_FILENAME="seguros-production_${TIMESTAMP}.sql.gz"
readonly CHECKSUM_FILENAME="${BACKUP_FILENAME}.sha256"
readonly TEMPORARY_DIRECTORY="$(mktemp -d)"
readonly BACKUP_PATH="${TEMPORARY_DIRECTORY}/${BACKUP_FILENAME}"
readonly CHECKSUM_PATH="${TEMPORARY_DIRECTORY}/${CHECKSUM_FILENAME}"
readonly SERVICE_ACCOUNT_PATH="${TEMPORARY_DIRECTORY}/google-service-account.json"
readonly RCLONE_CONFIG_PATH="${TEMPORARY_DIRECTORY}/rclone.conf"
readonly DATABASE_ENV_PATH="${TEMPORARY_DIRECTORY}/database.env"

cleanup() {
  unset PGDATABASE BACKUP_DATABASE_URL GDRIVE_SERVICE_ACCOUNT_JSON
  rm -f \
    "$BACKUP_PATH" \
    "$CHECKSUM_PATH" \
    "$SERVICE_ACCOUNT_PATH" \
    "$RCLONE_CONFIG_PATH" \
    "$DATABASE_ENV_PATH"
  rmdir "$TEMPORARY_DIRECTORY" 2>/dev/null || true
}
trap cleanup EXIT

printf '%s' "$GDRIVE_SERVICE_ACCOUNT_JSON" > "$SERVICE_ACCOUNT_PATH"
unset GDRIVE_SERVICE_ACCOUNT_JSON

cat > "$RCLONE_CONFIG_PATH" <<EOF
[backup-drive]
type = drive
scope = drive
service_account_file = ${SERVICE_ACCOUNT_PATH}
root_folder_id = ${GDRIVE_FOLDER_ID}
EOF

export RCLONE_CONFIG="$RCLONE_CONFIG_PATH"

log "Iniciando backup lógico (${BACKUP_TIER})"

if [[ -n "${PG_DUMP_DOCKER_IMAGE:-}" ]]; then
  printf 'PGDATABASE=%s\n' "$BACKUP_DATABASE_URL" > "$DATABASE_ENV_PATH"
  unset BACKUP_DATABASE_URL
  docker run --rm \
    --env-file "$DATABASE_ENV_PATH" \
    "$PG_DUMP_DOCKER_IMAGE" \
    pg_dump \
      --format=plain \
      --encoding=UTF8 \
      --no-owner \
      --no-privileges \
      --no-password |
    gzip -9 > "$BACKUP_PATH"
else
  export PGDATABASE="$BACKUP_DATABASE_URL"
  pg_dump \
    --format=plain \
    --encoding=UTF8 \
    --no-owner \
    --no-privileges \
    --no-password |
    gzip -9 > "$BACKUP_PATH"
  unset PGDATABASE
fi

unset BACKUP_DATABASE_URL

gzip --test "$BACKUP_PATH"
[[ -s "$BACKUP_PATH" ]] || fail "El backup generado está vacío"

(
  cd "$TEMPORARY_DIRECTORY"
  sha256sum "$BACKUP_FILENAME" > "$CHECKSUM_FILENAME"
)

readonly REMOTE_DIRECTORY="${BACKUP_TIER}/${TIMESTAMP}"

log "Subiendo backup y checksum a Google Drive"
rclone copyto \
  "$BACKUP_PATH" \
  "backup-drive:${REMOTE_DIRECTORY}/${BACKUP_FILENAME}" \
  --drive-stop-on-upload-limit \
  --retries 3 \
  --low-level-retries 10 \
  --log-level NOTICE

rclone copyto \
  "$CHECKSUM_PATH" \
  "backup-drive:${REMOTE_DIRECTORY}/${CHECKSUM_FILENAME}" \
  --drive-stop-on-upload-limit \
  --retries 3 \
  --low-level-retries 10 \
  --log-level NOTICE

remote_listing="$(rclone lsf "backup-drive:${REMOTE_DIRECTORY}" --files-only)"
grep -Fxq "$BACKUP_FILENAME" <<< "$remote_listing" || fail "No se encontró el backup remoto"
grep -Fxq "$CHECKSUM_FILENAME" <<< "$remote_listing" || fail "No se encontró el checksum remoto"

log "Backup completado: ${BACKUP_TIER}/${TIMESTAMP}/${BACKUP_FILENAME}"
log "Backup y checksum verificados en el destino remoto"
