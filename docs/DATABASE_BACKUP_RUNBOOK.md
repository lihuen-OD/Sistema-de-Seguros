# Neon production backup runbook

## Alcance

Este procedimiento respalda diariamente el esquema y los datos PostgreSQL de la base de
producción de Neon en Google Drive. No incluye los archivos almacenados en Cloudinary.

El backup usa `pg_dump` en formato SQL plano, lo comprime con gzip, genera un checksum
SHA-256 y carga ambos archivos en la carpeta empresarial `Neon Production`.

## Controles de seguridad

- El workflow no recibe secretos en pull requests.
- Los secretos viven en el GitHub Environment `production-backup`.
- El cron solo se ejecuta cuando `BACKUPS_ENABLED` vale `true`.
- La URL de Neon no se imprime ni se pasa como argumento de `pg_dump`.
- Los temporales se crean con permisos restrictivos y se eliminan al finalizar.
- La restauración siempre se prueba en una base vacía y aislada; nunca directamente sobre
  production.

## Configuración de GitHub

Environment requerido: `production-backup`.

### Secrets

| Nombre | Uso |
| --- | --- |
| `GDRIVE_SERVICE_ACCOUNT_JSON` | JSON completo de la cuenta de servicio de Google |
| `NEON_BACKUP_DATABASE_URL` | URL directa de Neon para un rol dedicado de backup |

### Variables

| Nombre | Ejemplo | Uso |
| --- | --- | --- |
| `GDRIVE_FOLDER_ID` | ID de la carpeta, no la URL completa | Raíz de backups en Drive |
| `NEON_POSTGRES_MAJOR` | `17` | Versión de `pg_dump`; debe ser igual o superior al servidor |
| `BACKUPS_ENABLED` | `false` inicialmente | Habilita el cron solamente cuando vale `true` |

No reutilizar `DATABASE_URL` pooled de Render. La URL de backup debe usar el endpoint
directo de la branch correcta y `sslmode=require`.

## Activación gradual

1. Mantener `BACKUPS_ENABLED=false`.
2. Ejecutar manualmente `Neon production backup` con `drive-smoke-test`.
3. Confirmar en Drive el archivo dentro de `connection-tests/`.
4. Crear un rol PostgreSQL de backup con permisos mínimos.
5. Probar `backup` contra `development` o `demo` usando temporalmente un Environment de
   prueba separado. No usar credenciales production para esta validación.
6. Restaurar ese dump en una base vacía temporal y validar Prisma, tablas y secuencias.
7. Configurar `NEON_BACKUP_DATABASE_URL` de production.
8. Ejecutar un backup manual de production con aprobación explícita.
9. Restaurarlo en una base vacía aislada y completar la verificación.
10. Cambiar `BACKUPS_ENABLED=true`.

## Estructura en Drive

```text
Neon Production/
├── connection-tests/
├── daily/<timestamp>/
├── weekly/<timestamp>/
├── monthly/<timestamp>/
└── pre-migration/<timestamp>/
```

Cada carpeta de backup contiene:

```text
seguros-production_<timestamp>.sql.gz
seguros-production_<timestamp>.sql.gz.sha256
```

La implementación no elimina archivos automáticamente. La retención debe activarse solo
después de verificar varias restauraciones, para evitar que un error de automatización
borre la única copia válida.

## Restauración segura

### 1. Contener el incidente

1. Identificar la hora del borrado o corrupción.
2. Detener temporalmente escrituras del backend si el incidente sigue activo.
3. Preservar production para investigación.
4. Elegir un backup anterior al incidente.

### 2. Crear destino aislado

1. Crear una branch de recuperación y un compute propio en Neon, o un proyecto temporal.
2. Crear dentro de ese destino una base PostgreSQL vacía.
3. Obtener la URL directa de esa base.
4. Verificar hostname, branch y nombre de base antes de continuar.

Una branch clonada de production ya contiene datos. No cargar el dump encima de esas
tablas: crear una base vacía dentro del destino o usar un proyecto limpio.

### 3. Descargar y validar

```bash
sha256sum --check seguros-production_<timestamp>.sql.gz.sha256
gzip --test seguros-production_<timestamp>.sql.gz
```

### 4. Restaurar

```bash
export PGDATABASE="$RESTORE_DATABASE_URL"
gzip -dc seguros-production_<timestamp>.sql.gz |
  psql -X --set ON_ERROR_STOP=on
psql -X --set ON_ERROR_STOP=on -c "ANALYZE;"
unset PGDATABASE RESTORE_DATABASE_URL
```

### 5. Verificar

- Estado de `_prisma_migrations`.
- Conteos de pólizas, activos, documentos, siniestros, usuarios y auditorías.
- Relaciones entre pólizas, activos y documentos.
- Próximos valores de las secuencias personalizadas.
- Login y endpoints críticos usando un backend aislado.
- Ausencia de ejecuciones de seeds.
- Emails externos deshabilitados durante la prueba.

### 6. Recuperar servicio

La primera opción es apuntar temporalmente Render a la base restaurada, actualizando juntas
`DATABASE_URL` y `DIRECT_URL` para que ambas correspondan al mismo destino. Hacer smoke
tests antes de reabrir escrituras. No borrar la base dañada hasta cerrar el incidente.

## Pruebas recurrentes

- Revisar diariamente el resultado del workflow.
- Ejecutar un restore drill mensual.
- Registrar archivo, checksum, duración del dump, duración del restore y validaciones.
- Crear un backup `pre-migration` antes de migraciones importantes.
- Rotar la clave de Google y la contraseña del rol de Neon periódicamente.

