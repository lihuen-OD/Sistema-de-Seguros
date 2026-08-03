#!/usr/bin/env bash

set -Eeuo pipefail
set +x
umask 077

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

readonly BACKUP_PATH="${1:-}"
[[ -n "$BACKUP_PATH" ]] || fail "Uso: bash scripts/restore-neon-backup.sh <backup.sql.gz>"
[[ -f "$BACKUP_PATH" ]] || fail "No existe el backup: $BACKUP_PATH"

readonly CHECKSUM_PATH="${BACKUP_PATH}.sha256"
[[ -f "$CHECKSUM_PATH" ]] || fail "No existe el checksum: $CHECKSUM_PATH"

readonly PSQL_PATH="/Applications/Postgres.app/Contents/Versions/latest/bin/psql"
[[ -x "$PSQL_PATH" ]] || fail "No se encontró psql de Postgres.app"

RESTORE_DATABASE_URL=""
cleanup() {
  unset RESTORE_DATABASE_URL
}
trap cleanup EXIT

printf 'Pegá la URL directa de Neon para la base restore_test y presioná Enter:\n'
IFS= read -r -s RESTORE_DATABASE_URL
printf '\n'

[[ "$RESTORE_DATABASE_URL" == postgresql://*'/restore_test?'* ]] ||
  fail "La URL no corresponde a la base restore_test"

# Conserva el destino y las credenciales, pero normaliza los parámetros opcionales
# que algunas interfaces pueden copiar con separadores adicionales.
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL%%\?*}?sslmode=require"

readonly DESTINATION="$("$PSQL_PATH" "$RESTORE_DATABASE_URL" \
  -X \
  --set ON_ERROR_STOP=on \
  --tuples-only \
  --no-align \
  --command "SELECT current_database() || '|' || current_user;")"

[[ "$DESTINATION" == 'restore_test|neondb_owner' ]] ||
  fail "Destino inesperado: ${DESTINATION}"

readonly EXISTING_TABLES="$("$PSQL_PATH" "$RESTORE_DATABASE_URL" \
  -X \
  --set ON_ERROR_STOP=on \
  --tuples-only \
  --no-align \
  --command "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';")"

[[ "$EXISTING_TABLES" == '0' ]] ||
  fail "restore_test no está vacía; tiene ${EXISTING_TABLES} tablas"

(
  cd "$(dirname "$BACKUP_PATH")"
  shasum -a 256 -c "$(basename "$CHECKSUM_PATH")"
)
gzip --test "$BACKUP_PATH"

printf 'Destino verificado: %s\n' "$DESTINATION"
printf 'Backup y checksum válidos. Escribí RESTAURAR para continuar: '
IFS= read -r CONFIRMATION
[[ "$CONFIRMATION" == 'RESTAURAR' ]] || fail "Restauración cancelada"

printf 'Restaurando el backup...\n'
gzip -dc "$BACKUP_PATH" |
  "$PSQL_PATH" "$RESTORE_DATABASE_URL" \
    -X \
    --set ON_ERROR_STOP=on

readonly RESTORED_TABLES="$("$PSQL_PATH" "$RESTORE_DATABASE_URL" \
  -X \
  --set ON_ERROR_STOP=on \
  --tuples-only \
  --no-align \
  --command "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';")"

printf 'RESTAURACIÓN COMPLETADA\n'
printf 'Tablas restauradas: %s\n' "$RESTORED_TABLES"
