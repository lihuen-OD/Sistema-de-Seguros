/**
 * seed-config.ts
 *
 * Siembra (o actualiza) ÚNICAMENTE los catálogos de Configuración de Módulos.
 * Seguro para correr en producción: elimina solo los catalog_items
 * y los recrea. No toca pólizas, activos, empresas ni ningún otro dato.
 *
 * Uso:
 *   npm run db:seed:config
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATALOGS: Record<string, string[]> = {
  // ── Aseguradoras ────────────────────────────────────────────────────────
  insurance_company: [
    'La Segunda',
    'Sancor Seguros',
    'MAPFRE Argentina',
    'Zurich Argentina',
    'Allianz Argentina',
    'SMG Seguros',
    'Seguros Rivadavia',
    'Federación Patronal',
    'Galeno Seguros',
    'Meridional Seguros',
    'BBVA Seguros',
    'Experta Seguros',
    'Prevención Seguros',
    'Provincia Seguros',
    'Nación Seguros',
    'Prudencia Seguros',
  ],

  // ── Activos — Vehículos ─────────────────────────────────────────────────
  asset_fuel_type: [
    'Diésel',
    'Nafta',
    'GNC',
    'Eléctrico',
    'Híbrido',
  ],

  // ── Activos — Inmuebles ─────────────────────────────────────────────────
  asset_building_purpose: [
    'Galpón',
    'Depósito',
    'Vivienda',
    'Oficinas',
    'Taller',
    'Industrial',
    'Producción porcina',
    'Producción avícola',
    'Tambo',
    'Otro',
  ],

  // ── Activos — Infraestructura ───────────────────────────────────────────
  asset_infrastructure_type: [
    'Silo',
    'Tanque de agua',
    'Tanque de combustible',
    'Obra civil',
    'Alambrado',
    'Manga y corral',
    'Molino',
    'Otro',
  ],

  // ── Activos — Silos ─────────────────────────────────────────────────────
  asset_silo_content: [
    'Soja',
    'Maíz',
    'Trigo',
    'Cebada',
    'Girasol',
    'Sorgo',
    'Maní',
    'Vacío / disponible',
    'Otro',
  ],

  // ── Activos — Hacienda ──────────────────────────────────────────────────
  asset_cargo_species: [
    'Porcino',
    'Bovino',
    'Ovino',
    'Caprino',
    'Avícola',
    'Equino',
    'Otro',
  ],

  // ── Activos — Implementos Agrícolas ────────────────────────────────────
  asset_implement_type: [
    'Sembradora',
    'Arado',
    'Rastra',
    'Fertilizadora',
    'Cincel',
    'Rolo',
    'Acoplado tolva',
    'Acoplado caja',
    'Fumigadora',
    'Otro',
  ],

  // ── Activos — Unidades Productivas ─────────────────────────────────────
  asset_productive_unit: [
    'Agrícola Norte',
    'Agrícola Sur',
    'Ganadería',
    'Logística',
    'Administración',
    'Mantenimiento',
  ],

  // ── Activos — Áreas ─────────────────────────────────────────────────────
  asset_area: [
    'Producción',
    'Administración',
    'Logística',
    'Comercial',
    'Mantenimiento',
    'RRHH',
  ],

  // ── Matafuegos — Tipo ───────────────────────────────────────────────────
  fire_ext_type: [
    'Polvo seco ABC',
    'CO2',
    'Agua',
    'Espuma',
    'Halón',
  ],

  // ── Matafuegos — Capacidad ──────────────────────────────────────────────
  fire_ext_capacity: [
    '1 kg',
    '2 kg',
    '4 kg',
    '6 kg',
    '10 kg',
    '25 kg',
    '50 kg',
  ],

  // ── Matafuegos — Tipo de ubicación ──────────────────────────────────────
  fire_ext_location_type: [
    'Vehículo',
    'Maquinaria',
    'Establecimiento',
    'Edificio',
    'Infraestructura',
  ],

  // ── Matafuegos — Establecimiento ─────────────────────────────────────────
  fire_ext_establishment: [
    'LA SUCHO',
    'LA HONORIA',
    'PLANTA',
    'TALLER',
    'OFICINA',
  ],

  // ── Matafuegos — Marca ────────────────────────────────────────────────────
  fire_ext_brand: [
    'FADESA',
    'GEORGIA',
    'MELISAM',
    'FISTORAY',
    'NORBCO',
    'HORIZONTE',
    'PATAGONIA',
  ],

  // ── Tareas ──────────────────────────────────────────────────────────────
  task_type: [
    'Solicitar cotización',
    'Renovar póliza',
    'Enviar documentación',
    'Gestionar siniestro',
    'Solicitar endoso',
    'Reclamar documentación',
    'Revisar vencimiento',
    'Auditoría de activos',
  ],

  // ── Documentos Contables ────────────────────────────────────────────────
  // Nota: los tipos de documento (Factura, Nota de Crédito, etc.) ya no son un
  // catálogo editable — están controlados en backend/src/modules/documents/document-types.ts

  document_payment_method: [
    'Transferencia bancaria',
    'E-Cheq',
    'Efectivo',
    'Débito automático',
    'Otros',
  ],

  document_currency: [
    'ARS',
    'USD',
  ],

  // ── Siniestros ──────────────────────────────────────────────────────────
  claim_type: [
    'Accidente',
    'Robo con violencia',
    'Hurto',
    'Incendio',
    'Granizo',
    'Granizo (cosecha)',
    'Inundación',
    'Daños materiales',
    'Daños eléctricos',
    'Rotura mecánica',
    'Responsabilidad civil',
    'Muerte accidental',
    'Incapacidad',
    'Otro',
  ],

  claim_status: [
    'Denunciado',
    'En trámite',
    'Liquidado',
    'Rechazado',
    'Cerrado',
  ],
}

async function main() {
  console.log('⚙️  Configuración de Módulos — iniciando seed...')
  console.log('   (solo catálogos — no modifica pólizas, activos ni otros datos)')

  let totalCreated = 0
  let totalDeleted = 0

  for (const [category, labels] of Object.entries(CATALOGS)) {
    const deleted = await prisma.catalogItem.deleteMany({ where: { category } })
    totalDeleted += deleted.count

    await prisma.catalogItem.createMany({
      data: labels.map((label, i) => ({ category, label, sortOrder: i })),
    })
    totalCreated += labels.length

    console.log(`  ✔ ${category.padEnd(30)} → ${labels.length} ítems`)
  }

  console.log(`\n✅ Configuración de Módulos completada.`)
  console.log(`   Categorías: ${Object.keys(CATALOGS).length}`)
  console.log(`   Ítems creados: ${totalCreated} (reemplazaron ${totalDeleted} existentes)`)
}

main()
  .catch((e) => {
    console.error('❌ Error en seed-config:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
