/**
 * seed-fixed-assets.ts
 *
 * Siembra (o actualiza) ÚNICAMENTE el catálogo de Bienes de Uso. Usa upsert
 * por código: es seguro correrlo más de una vez y no borra bienes de uso que
 * se hayan creado después desde la UI. No toca activos, pólizas, empresas ni
 * ningún otro dato.
 *
 * Uso:
 *   npm run db:seed:fixed-assets
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FIXED_ASSETS = [
  { code: 'ROD-001', name: 'Camioneta doble cabina 4×4 — Flota agrícola' },
  { code: 'ROD-002', name: 'Camioneta doble cabina 4×4 — Flota agrícola II' },
  { code: 'ROD-003', name: 'Camioneta 4×4 doble cabina — Jefatura producción' },
  { code: 'ROD-004', name: 'Camión semirremolque tractor — Transporte de cereales I' },
  { code: 'ROD-005', name: 'Camión semirremolque tractor — Transporte de cereales II' },
  { code: 'ROD-006', name: 'Camión semirremolque tractor — Transporte (baja)' },
  { code: 'ROD-007', name: 'Camioneta cabina simple 4×2 — Mantenimiento' },
  { code: 'ROD-008', name: 'Vehículo de dirección — Gerencia' },
  { code: 'ROD-009', name: 'Moto utilitaria — Campo norte' },
  { code: 'ROD-010', name: 'Camioneta 4×4 — Pendiente de registro' },
  { code: 'MAQ-001', name: 'Tractor alta potencia — Campaña agrícola norte' },
  { code: 'MAQ-002', name: 'Cosechadora de granos autopropulsada' },
  { code: 'MAQ-003', name: 'Pulverizadora autopropulsada — Zona sur' },
  { code: 'MAQ-004', name: 'Tractor mediana potencia — Campaña agrícola sur' },
  { code: 'MAQ-005', name: 'Sembradora de precisión — Pendiente de alta en sistema' },
  { code: 'MAQ-006', name: 'Mixer unifeed ganadero — Sin asignar' },
  { code: 'IMP-001', name: 'Plataforma draper flexhea para cosechadora' },
  { code: 'IMP-002', name: 'Plataforma girasolera 12 surcos — Sin asignar' },
  { code: 'INM-001', name: 'Campo agrícola zona núcleo — 1.200 ha' },
  { code: 'INM-002', name: 'Inmueble oficinas — CABA, planta baja y 3 pisos' },
  { code: 'INM-003', name: 'Lote industrial — Área logística, pendiente de registro' },
  { code: 'INF-001', name: 'Planta de almacenamiento cereales — Puerto Rosario' },
  { code: 'INF-002', name: 'Batería de silos metálicos — Est. El Ombú, lote 3' },
  { code: 'INF-003', name: 'Red de riego por goteo — Sin asignar' },
]

async function main() {
  console.log('📦 Bienes de Uso — iniciando seed...')
  console.log('   (solo fixed_assets, vía upsert por código — no modifica activos, pólizas ni otros datos)')

  let created = 0
  let updated = 0

  for (const fa of FIXED_ASSETS) {
    const existing = await prisma.fixedAsset.findUnique({ where: { code: fa.code } })
    await prisma.fixedAsset.upsert({
      where: { code: fa.code },
      create: fa,
      update: fa,
    })
    if (existing) updated++
    else created++
  }

  console.log(`\n✅ Bienes de Uso completado.`)
  console.log(`   Creados: ${created} | Actualizados: ${updated}`)
}

main()
  .catch((e) => {
    console.error('❌ Error en seed-fixed-assets:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
