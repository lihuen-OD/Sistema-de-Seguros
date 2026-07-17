/**
 * seed-access-profiles.ts
 *
 * Siembra (o actualiza) perfiles de acceso de ejemplo — los mismos casos de
 * uso descritos al pedir esta funcionalidad. Usa upsert por nombre: es
 * seguro correrlo más de una vez y no borra perfiles creados después desde
 * la UI. No toca usuarios, activos, pólizas ni ningún otro dato.
 *
 * Uso:
 *   npm run db:seed:access-profiles
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// `fire_extinguisher_audit_coverage` (auditar/crear) y `fire_extinguisher_audits`
// (revisar/aprobar) están separados a propósito y NUNCA deben coexistir en el
// mismo perfil — si no, la misma persona podría auditar y aprobar su propia
// auditoría (ver el chequeo `audit.auditedBy === reviewedBy` en
// fire-extinguisher-audits.service.ts#review).
const PROFILES = [
  { name: 'Seguros', modules: ['assets', 'policies', 'documents'] },
  { name: 'Siniestros', modules: ['claims'] },
  { name: 'Auditor de Matafuegos', modules: ['fire_extinguishers', 'fire_extinguisher_audit_coverage'] },
  { name: 'Revisor de Auditorías de Matafuegos', modules: ['fire_extinguishers', 'fire_extinguisher_audits'] },
]

async function main() {
  console.log('🔑 Perfiles de Acceso — iniciando seed...')
  console.log('   (solo access_profiles, vía upsert por nombre — no modifica usuarios ni otros datos)')

  let created = 0
  let updated = 0

  for (const profile of PROFILES) {
    const existing = await prisma.accessProfile.findUnique({ where: { name: profile.name } })
    await prisma.accessProfile.upsert({
      where: { name: profile.name },
      create: profile,
      update: profile,
    })
    if (existing) updated++
    else created++
  }

  console.log(`\n✅ Perfiles de Acceso completado.`)
  console.log(`   Creados: ${created} | Actualizados: ${updated}`)
}

main()
  .catch((e) => {
    console.error('❌ Error en seed-access-profiles:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
