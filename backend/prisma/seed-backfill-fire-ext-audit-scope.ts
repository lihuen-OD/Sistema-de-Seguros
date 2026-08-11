/**
 * seed-backfill-fire-ext-audit-scope.ts
 *
 * Paso único de migración, a correr UNA VEZ al desplegar el enforcement de
 * alcance de auditoría de matafuegos (UserAuditScope). Hoy, sin esta tabla,
 * cualquier usuario con el módulo `fire_extinguisher_audit_coverage` puede
 * auditar cualquier establecimiento — este script le asigna a cada uno de
 * esos usuarios TODOS los establecimientos activos existentes, preservando
 * exactamente el acceso que ya tenían el día antes del deploy. No reparte
 * nada por persona — eso lo hace el ADMIN manualmente después, desde la
 * pantalla de Usuarios ("Alcance de auditoría").
 *
 * Idempotente: usa createMany con skipDuplicates, seguro de correr más de
 * una vez (ej. si se agrega un usuario nuevo con este módulo más adelante).
 * No modifica usuarios, perfiles de acceso ni matafuegos.
 *
 * Uso:
 *   npm run db:seed:backfill-fire-ext-audit-scope
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧯 Backfill de alcance de auditoría de matafuegos — iniciando...')

  const [auditors, establishments] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        role: 'USER',
        accessProfile: { modules: { has: 'fire_extinguisher_audit_coverage' } },
      },
      select: { id: true, name: true, email: true },
    }),
    prisma.catalogItem.findMany({
      where: { category: 'fire_ext_establishment', isActive: true },
      select: { label: true },
    }),
  ])

  if (auditors.length === 0) {
    console.log('   No hay usuarios activos con el módulo fire_extinguisher_audit_coverage. Nada para hacer.')
    return
  }
  if (establishments.length === 0) {
    console.log('   No hay establecimientos activos en el catálogo fire_ext_establishment. Nada para hacer.')
    return
  }

  const scopeRows = auditors.flatMap((user) =>
    establishments.map((e) => ({ userId: user.id, area: 'FIRE_EXTINGUISHER_AUDIT', scopeValue: e.label })),
  )

  const result = await prisma.userAuditScope.createMany({ data: scopeRows, skipDuplicates: true })

  console.log(`\n✅ Backfill completado.`)
  console.log(`   Auditores procesados: ${auditors.length}`)
  console.log(`   Establecimientos por auditor: ${establishments.length}`)
  console.log(`   Filas de alcance creadas: ${result.count} (las ya existentes se omiten)`)
  console.log('\n   Detalle:')
  for (const user of auditors) {
    console.log(`   - ${user.name} <${user.email}>: ${establishments.map((e) => e.label).join(', ')}`)
  }
  console.log('\n   Próximo paso: entrar a Usuarios y repartir manualmente el alcance real de cada persona.')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed-backfill-fire-ext-audit-scope:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
