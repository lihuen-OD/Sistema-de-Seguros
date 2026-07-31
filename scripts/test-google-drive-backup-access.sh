#!/usr/bin/env bash

set -Eeuo pipefail
set +x
umask 077

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v rclone >/dev/null 2>&1 || fail "Falta el comando requerido: rclone"
[[ -n "${GDRIVE_FOLDER_ID:-}" ]] || fail "Falta GDRIVE_FOLDER_ID"
[[ -n "${GDRIVE_SERVICE_ACCOUNT_JSON:-}" ]] || fail "Falta GDRIVE_SERVICE_ACCOUNT_JSON"

readonly TEMPORARY_DIRECTORY="$(mktemp -d)"
readonly SERVICE_ACCOUNT_PATH="${TEMPORARY_DIRECTORY}/google-service-account.json"
readonly RCLONE_CONFIG_PATH="${TEMPORARY_DIRECTORY}/rclone.conf"
readonly TIMESTAMP="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
readonly TEST_FILENAME="drive-smoke-test_${TIMESTAMP}.txt"
readonly TEST_PATH="${TEMPORARY_DIRECTORY}/${TEST_FILENAME}"

cleanup() {
  unset GDRIVE_SERVICE_ACCOUNT_JSON
  rm -f "$SERVICE_ACCOUNT_PATH" "$RCLONE_CONFIG_PATH" "$TEST_PATH"
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

printf 'Prueba de acceso para backups del Sistema de Seguros. Fecha UTC: %s\n' "$TIMESTAMP" > "$TEST_PATH"

rclone copyto \
  "$TEST_PATH" \
  "backup-drive:connection-tests/${TEST_FILENAME}" \
  --drive-stop-on-upload-limit \
  --retries 3 \
  --low-level-retries 10 \
  --log-level NOTICE

remote_listing="$(rclone lsf "backup-drive:connection-tests" --files-only)"
grep -Fxq "$TEST_FILENAME" <<< "$remote_listing" ||
  fail "El archivo se subió, pero no se encontró durante la verificación remota"

printf 'Prueba completada. Archivo creado: connection-tests/%s\n' "$TEST_FILENAME"
