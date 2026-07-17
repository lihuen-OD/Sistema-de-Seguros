import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function d(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00.000Z').toISOString()
}

async function main() {
  console.log('Limpiando base de datos...')

  await prisma.catalogItem.deleteMany()
  await prisma.claimEvent.deleteMany()
  await prisma.claimAttachment.deleteMany()
  await prisma.claim.deleteMany()
  await prisma.fireExtinguisherHistory.deleteMany()
  await prisma.fireExtinguisher.deleteMany()
  await prisma.documentAttachment.deleteMany()
  await prisma.documentPolicyAllocation.deleteMany()
  await prisma.documentInstallment.deleteMany()
  await prisma.accountingDocument.deleteMany()
  await prisma.policyAttachment.deleteMany()
  await prisma.policy.deleteMany()
  await prisma.producerTask.deleteMany()
  await prisma.producer.deleteMany()
  await prisma.assetAttachment.deleteMany()
  await prisma.assetValueHistory.deleteMany()
  await prisma.assetStatusHistory.deleteMany()
  await prisma.assetAllocation.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.fixedAsset.deleteMany()
  await prisma.insuranceCoverage.deleteMany()
  await prisma.insuranceType.deleteMany()
  await prisma.costCenter.deleteMany()
  await prisma.company.deleteMany()

  console.log('Base limpia. Insertando datos...')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 1 — Empresas
  // ─────────────────────────────────────────────────────────────────────────

  const [compOdwyerSA, compCampoNorte, compLogisticaOD] = await Promise.all([
    prisma.company.create({
      data: {
        name: "Los O'Dwyer S.A.",
        cuit: '30-71234567-8',
        email: 'admin@losodwyer.com',
        phone: '0351-4123456',
        address: 'Av. Vélez Sarsfield 3450, Córdoba',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Campo Norte S.R.L.',
        cuit: '30-71234568-6',
        email: 'campo@losodwyer.com',
        phone: '03548-412345',
        address: 'Ruta 9 km 12, Jesús María, Córdoba',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Logística OD S.A.',
        cuit: '30-71234569-4',
        email: 'logistica@losodwyer.com',
        phone: '0351-4234567',
        address: 'Parque Industrial Córdoba, Córdoba',
      },
    }),
  ])
  console.log('  OK Empresas (3)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 2 — Centros de Costo
  // ─────────────────────────────────────────────────────────────────────────

  const [ccAdmin, ccOps, ccLogistica, ccAgro] = await Promise.all([
    prisma.costCenter.create({
      data: { name: 'Administración Central', code: 'ADM-001', description: 'Gastos administrativos y de gestión corporativa' },
    }),
    prisma.costCenter.create({
      data: { name: 'Operaciones Campo', code: 'OPS-001', description: 'Producción agrícola y actividades de campo' },
    }),
    prisma.costCenter.create({
      data: { name: 'Logística y Transporte', code: 'LOG-001', description: 'Flota de vehículos y operaciones de transporte' },
    }),
    prisma.costCenter.create({
      data: { name: 'Agroindustria', code: 'AGR-001', description: 'Procesamiento y almacenamiento de granos' },
    }),
  ])
  console.log('  OK Centros de Costo (4)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 3 — Tipos de Seguro + Coberturas (creadas por separado para capturar IDs)
  // ─────────────────────────────────────────────────────────────────────────

  const [tipoIncendio, tipoAuto, tipoRC, tipoAP, tipoMultiRiesgo, tipoTransporte] =
    await Promise.all([
      prisma.insuranceType.create({
        data: { name: 'Incendio y Riesgo Afines', description: 'Cubre daños por incendio, rayo y explosión en inmuebles y contenido.' },
      }),
      prisma.insuranceType.create({
        data: { name: 'Automotores', description: 'Póliza integral para vehículos: RC, daños propios y robo.' },
      }),
      prisma.insuranceType.create({
        data: { name: 'Responsabilidad Civil', description: 'Cubre la responsabilidad civil del asegurado frente a terceros.' },
      }),
      prisma.insuranceType.create({
        data: { name: 'Accidentes Personales', description: 'Cubre accidentes personales del asegurado y personal a cargo.' },
      }),
      prisma.insuranceType.create({
        data: { name: 'Multirriesgo Agropecuario', description: 'Cobertura integral para maquinaria agrícola y riesgos del campo.' },
      }),
      prisma.insuranceType.create({
        data: { name: 'Transporte de Mercancías', description: 'Cubre mercancías en tránsito por vía terrestre.' },
      }),
    ])

  const [covIncendio, covRayo, covExplosion, covRoboContenido] = await Promise.all([
    prisma.insuranceCoverage.create({ data: { name: 'Incendio', description: 'Daños directos por fuego', insuranceTypeId: tipoIncendio.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Rayo', description: 'Daños por descarga eléctrica atmosférica', insuranceTypeId: tipoIncendio.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Explosión', description: 'Daños por explosión de cualquier origen', insuranceTypeId: tipoIncendio.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Robo de Contenido', description: 'Robo o hurto de bienes asegurados', insuranceTypeId: tipoIncendio.id } }),
  ])
  await prisma.insuranceCoverage.create({ data: { name: 'Daños por Agua', description: 'Daños por agua de cañerías', insuranceTypeId: tipoIncendio.id } })

  const [covAutoRC, covAutoDanios, covAutoRobo, covAutoGranizo, covAutoIncendio] =
    await Promise.all([
      prisma.insuranceCoverage.create({ data: { name: 'Responsabilidad Civil', description: 'Daños a terceros (obligatorio)', insuranceTypeId: tipoAuto.id } }),
      prisma.insuranceCoverage.create({ data: { name: 'Daños Propios', description: 'Daños al propio vehículo por accidente', insuranceTypeId: tipoAuto.id } }),
      prisma.insuranceCoverage.create({ data: { name: 'Robo / Hurto Total', description: 'Robo o hurto total del vehículo', insuranceTypeId: tipoAuto.id } }),
      prisma.insuranceCoverage.create({ data: { name: 'Granizo', description: 'Daños por granizo sobre la carrocería', insuranceTypeId: tipoAuto.id } }),
      prisma.insuranceCoverage.create({ data: { name: 'Incendio Vehículo', description: 'Incendio total o parcial del rodado', insuranceTypeId: tipoAuto.id } }),
    ])

  const [covRCGeneral, covRCProductos, covRCEmpleadores] = await Promise.all([
    prisma.insuranceCoverage.create({ data: { name: 'RC General', description: 'RC por actividades generales de la empresa', insuranceTypeId: tipoRC.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'RC Productos', description: 'RC por productos elaborados o vendidos', insuranceTypeId: tipoRC.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'RC Empleadores', description: 'RC frente a empleados en el trabajo', insuranceTypeId: tipoRC.id } }),
  ])
  await prisma.insuranceCoverage.create({ data: { name: 'RC Cruzada', description: 'RC recíproca entre empresas del grupo', insuranceTypeId: tipoRC.id } })

  const [covAPMuerte, covAPITP, covAPGastosMedicos, covAPSepelio] = await Promise.all([
    prisma.insuranceCoverage.create({ data: { name: 'Muerte Accidental', description: 'Capital por muerte por accidente', insuranceTypeId: tipoAP.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Incapacidad Total y Permanente', description: 'Capital por ITP', insuranceTypeId: tipoAP.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Gastos Médicos', description: 'Reembolso de gastos médicos por accidente', insuranceTypeId: tipoAP.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Sepelio', description: 'Gastos de sepelio por muerte accidental', insuranceTypeId: tipoAP.id } }),
  ])

  const [covGranizoCosecha, covRoturaMaquinaria, covViento] = await Promise.all([
    prisma.insuranceCoverage.create({ data: { name: 'Granizo sobre Cosecha', description: 'Daños por granizo en cultivos asegurados', insuranceTypeId: tipoMultiRiesgo.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Rotura de Maquinaria', description: 'Rotura accidental de maquinaria agrícola', insuranceTypeId: tipoMultiRiesgo.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Viento / Tornado', description: 'Daños estructurales por viento', insuranceTypeId: tipoMultiRiesgo.id } }),
  ])
  await prisma.insuranceCoverage.create({ data: { name: 'Incendio de Pasturas', description: 'Pérdida de forraje por incendio', insuranceTypeId: tipoMultiRiesgo.id } })

  const [covTransTodoRiesgo, covTransRobo, covTransVuelco] = await Promise.all([
    prisma.insuranceCoverage.create({ data: { name: 'Todo Riesgo en Tránsito', description: 'Cobertura total durante el transporte', insuranceTypeId: tipoTransporte.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Robo en Tránsito', description: 'Robo de carga durante el traslado', insuranceTypeId: tipoTransporte.id } }),
    prisma.insuranceCoverage.create({ data: { name: 'Daños por Vuelco', description: 'Daños a la mercancía por accidente del vehículo', insuranceTypeId: tipoTransporte.id } }),
  ])

  console.log('  OK Tipos de Seguro (6) + Coberturas (25)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 4 — Productores
  // ─────────────────────────────────────────────────────────────────────────

  const [prodJuan, prodMaria, prodCarlos] = await Promise.all([
    prisma.producer.create({
      data: {
        name: 'Juan Carlos Rodríguez',
        email: 'jrodriguez@seguroslo.com.ar',
        phone: '0351-155-123456',
        matricula: 'MAT-12345',
        address: 'Av. Hipólito Yrigoyen 1256, Córdoba',
      },
    }),
    prisma.producer.create({
      data: {
        name: 'María Elena Pérez',
        email: 'mperez@seguroslo.com.ar',
        phone: '0351-155-654321',
        matricula: 'MAT-67890',
        address: 'Bv. San Juan 847, Córdoba',
      },
    }),
    prisma.producer.create({
      data: {
        name: 'Carlos Alberto Méndez',
        email: 'cmendez@productorods.com.ar',
        phone: '03548-155-987654',
        matricula: 'MAT-24680',
        address: 'Ruta 9 km 8, Jesús María, Córdoba',
      },
    }),
  ])
  console.log('  OK Productores (3)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 4b — Bienes de Uso (catálogo contable, antes mock de Finnegans)
  // ─────────────────────────────────────────────────────────────────────────

  const fixedAssetsData = [
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

  const createdFixedAssets = await Promise.all(
    fixedAssetsData.map((fa) => prisma.fixedAsset.create({ data: fa })),
  )
  const faByCode = new Map(createdFixedAssets.map((fa) => [fa.code, fa]))
  console.log(`  OK Bienes de Uso (${createdFixedAssets.length})`)

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 5 — Activos (con fixedAssetId → Bien de Uso real)
  // ─────────────────────────────────────────────────────────────────────────

  const [
    actEdificio,
    actCamion,
    actCosechadora,
    actGalpon,
    actTractor,
    actSilo,
    actPickup,
    actSembradora,
  ] = await Promise.all([
    prisma.asset.create({
      data: {
        code: 'INM-001',
        fixedAssetId: faByCode.get('INM-002')!.id,
        name: 'Edificio Principal — Planta Córdoba',
        assetType: 'inmueble',
        status: 'activo',
        location: 'Av. Vélez Sarsfield 3450, Córdoba',
        area: 'Administración',
        productiveUnit: 'Administración',
        purchaseDate: d('2010-03-15'),
        purchaseValue: 8000000,
        currentValue: 15000000,
        patrimonialValueNew: 22000000,
        description: 'Edificio de oficinas y planta de procesamiento. 1200 m² cubiertos.',
        allocations: {
          createMany: {
            data: [
              { companyId: compOdwyerSA.id, costCenterId: ccAdmin.id, percentage: 60 },
              { companyId: compOdwyerSA.id, costCenterId: ccOps.id, percentage: 40 },
            ],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'VEH-001',
        fixedAssetId: faByCode.get('ROD-004')!.id,
        name: 'Camión Scania R450 — Patente AB 123 CD',
        assetType: 'vehiculo',
        status: 'activo',
        brand: 'Scania',
        model: 'R450',
        year: 2021,
        serialNumber: '9BSR6X4006B412345',
        purchaseDate: d('2021-08-01'),
        purchaseValue: 7000000,
        currentValue: 8500000,
        location: 'Planta Córdoba',
        area: 'Logística',
        productiveUnit: 'Logística',
        allocations: {
          createMany: {
            data: [{ companyId: compLogisticaOD.id, costCenterId: ccLogistica.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'MAQ-001',
        fixedAssetId: faByCode.get('MAQ-002')!.id,
        name: 'Cosechadora John Deere S770',
        assetType: 'maquinaria_agricola',
        status: 'activo',
        brand: 'John Deere',
        model: 'S770',
        year: 2022,
        serialNumber: '1H0S770SRLN123456',
        purchaseDate: d('2022-04-10'),
        purchaseValue: 38000000,
        currentValue: 45000000,
        area: 'Producción',
        productiveUnit: 'Agrícola Norte',
        description: 'Cosechadora de gran porte para uso agrícola extensivo.',
        allocations: {
          createMany: {
            data: [{ companyId: compCampoNorte.id, costCenterId: ccOps.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'INM-002',
        fixedAssetId: faByCode.get('INM-003')!.id,
        name: 'Galpón de Almacenamiento — Depósito Norte',
        assetType: 'inmueble',
        status: 'activo',
        location: 'Ruta 9 km 12, Jesús María, Córdoba',
        area: 'Logística',
        productiveUnit: 'Agrícola Norte',
        purchaseDate: d('2015-06-20'),
        purchaseValue: 2500000,
        currentValue: 3500000,
        description: 'Galpón metálico 800 m² con sector de carga y cámara de frío.',
        allocations: {
          createMany: {
            data: [
              { companyId: compCampoNorte.id, costCenterId: ccLogistica.id, percentage: 70 },
              { companyId: compCampoNorte.id, costCenterId: ccOps.id, percentage: 30 },
            ],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'MAQ-002',
        fixedAssetId: faByCode.get('MAQ-001')!.id,
        name: 'Tractor John Deere 6135B',
        assetType: 'vehiculo',
        status: 'activo',
        brand: 'John Deere',
        model: '6135B',
        year: 2020,
        serialNumber: 'PY6135B654321',
        purchaseDate: d('2020-11-05'),
        purchaseValue: 12000000,
        currentValue: 14000000,
        area: 'Producción',
        productiveUnit: 'Agrícola Sur',
        allocations: {
          createMany: {
            data: [{ companyId: compCampoNorte.id, costCenterId: ccOps.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'INF-001',
        fixedAssetId: faByCode.get('INF-002')!.id,
        name: 'Silo Metálico 1500 tn — Jesús María',
        assetType: 'silo',
        status: 'activo',
        location: 'Ruta 9 km 12, Jesús María, Córdoba',
        area: 'Producción',
        productiveUnit: 'Agrícola Norte',
        purchaseDate: d('2018-03-01'),
        purchaseValue: 4200000,
        currentValue: 5000000,
        description: 'Silo metálico capacidad 1500 tn. Contenido actual: soja.',
        metadata: { siloContent: 'Soja', siloCapacity: 1500 },
        allocations: {
          createMany: {
            data: [{ companyId: compCampoNorte.id, costCenterId: ccAgro.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'VEH-002',
        fixedAssetId: faByCode.get('ROD-001')!.id,
        name: 'Toyota Hilux GR-S 4x4 — Patente GH 456 IJ',
        assetType: 'vehiculo',
        status: 'activo',
        brand: 'Toyota',
        model: 'Hilux GR-S',
        year: 2023,
        serialNumber: 'MR0GX8CD6P0123456',
        purchaseDate: d('2023-01-20'),
        purchaseValue: 6500000,
        currentValue: 7800000,
        location: 'Planta Córdoba',
        area: 'Administración',
        productiveUnit: 'Administración',
        allocations: {
          createMany: {
            data: [{ companyId: compOdwyerSA.id, costCenterId: ccAdmin.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        code: 'IMP-001',
        fixedAssetId: faByCode.get('IMP-001')!.id,
        name: 'Sembradora Crucianelli Gringa 8000 (32 líneas)',
        assetType: 'maquinaria_agricola',
        status: 'activo',
        brand: 'Crucianelli',
        model: 'Gringa 8000',
        year: 2021,
        serialNumber: 'CRU-2021-G8K-00456',
        purchaseDate: d('2021-10-15'),
        purchaseValue: 9500000,
        currentValue: 11000000,
        area: 'Producción',
        productiveUnit: 'Agrícola Norte',
        description: 'Sembradora de grano fino y grueso, 32 líneas a 35 cm.',
        allocations: {
          createMany: {
            data: [{ companyId: compCampoNorte.id, costCenterId: ccOps.id, percentage: 100 }],
          },
        },
      },
    }),
  ])
  console.log('  OK Activos (8) + Imputaciones + Bienes de Uso vinculados')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 5b — Historial de Valores
  // ─────────────────────────────────────────────────────────────────────────

  await prisma.assetValueHistory.createMany({
    data: [
      { assetId: actEdificio.id, value: 8000000, date: d('2010-03-15'), type: 'compra', note: 'Valor de compra original' },
      { assetId: actEdificio.id, value: 10500000, date: d('2018-06-01'), type: 'revaluo', note: 'Revalúo técnico 2018' },
      { assetId: actEdificio.id, value: 12800000, date: d('2021-12-01'), type: 'revaluo', note: 'Actualización por inflación' },
      { assetId: actEdificio.id, value: 15000000, date: d('2025-01-01'), type: 'real', note: 'Valor de mercado actualizado' },
      { assetId: actCosechadora.id, value: 38000000, date: d('2022-04-10'), type: 'compra', note: 'Valor de compra' },
      { assetId: actCosechadora.id, value: 41000000, date: d('2023-04-01'), type: 'revaluo', note: 'Actualización campaña 2022/23' },
      { assetId: actCosechadora.id, value: 45000000, date: d('2024-04-01'), type: 'real', note: 'Valor de mercado campaña 2023/24' },
      { assetId: actTractor.id, value: 12000000, date: d('2020-11-05'), type: 'compra', note: 'Valor de compra' },
      { assetId: actTractor.id, value: 14000000, date: d('2024-11-01'), type: 'real', note: 'Tasación mercado noviembre 2024' },
      { assetId: actSembradora.id, value: 9500000, date: d('2021-10-15'), type: 'compra', note: 'Valor de compra' },
      { assetId: actSembradora.id, value: 11000000, date: d('2025-10-01'), type: 'real', note: 'Actualización mercado 2025' },
    ],
  })
  console.log('  OK Historial de valores (11 entradas)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 6 — Pólizas (con coverageIds reales y assetIds array)
  // ─────────────────────────────────────────────────────────────────────────

  const [polIncendio, polAuto, polRC, polAP, polMultiRiesgo, polTransporte] = await Promise.all([
    // Vence 30/06/2026 (mañana) — genera alertas urgentes
    prisma.policy.create({
      data: {
        policyNumber: 'LS-INC-2025-001234',
        insuranceTypeId: tipoIncendio.id,
        companyId: compOdwyerSA.id,
        costCenterId: ccAdmin.id,
        producerId: prodJuan.id,
        insuredName: 'La Segunda',
        assetIds: [actEdificio.id],
        startDate: d('2025-07-01'),
        endDate: d('2026-06-30'),
        premium: 280000,
        currency: 'ARS',
        description: 'Cobertura integral edificio y contenido. Planta Córdoba.',
        coverageIds: [covIncendio.id, covRayo.id, covExplosion.id, covRoboContenido.id],
      },
    }),
    // Vigente — 2 activos en la misma poliza
    prisma.policy.create({
      data: {
        policyNumber: 'FP-AUT-2026-005678',
        insuranceTypeId: tipoAuto.id,
        companyId: compLogisticaOD.id,
        costCenterId: ccLogistica.id,
        producerId: prodMaria.id,
        insuredName: 'Federación Patronal',
        assetIds: [actCamion.id, actPickup.id],
        startDate: d('2026-01-01'),
        endDate: d('2026-12-31'),
        premium: 320000,
        currency: 'ARS',
        description: 'Póliza todo riesgo flota. Scania R450 + Toyota Hilux GR-S.',
        coverageIds: [covAutoRC.id, covAutoDanios.id, covAutoRobo.id, covAutoGranizo.id, covAutoIncendio.id],
      },
    }),
    // Próxima a vencer — vence en 15 días
    prisma.policy.create({
      data: {
        policyNumber: 'ZA-RC-2025-009012',
        insuranceTypeId: tipoRC.id,
        companyId: compOdwyerSA.id,
        costCenterId: ccAdmin.id,
        producerId: prodJuan.id,
        insuredName: 'Zurich Argentina',
        assetIds: [],
        startDate: d('2025-07-15'),
        endDate: d('2026-07-14'),
        premium: 95000,
        currency: 'ARS',
        description: 'RC General para actividades industriales y logísticas.',
        coverageIds: [covRCGeneral.id, covRCProductos.id, covRCEmpleadores.id],
      },
    }),
    // Vencida hace 4 meses
    prisma.policy.create({
      data: {
        policyNumber: 'LS-AP-2024-003456',
        insuranceTypeId: tipoAP.id,
        companyId: compCampoNorte.id,
        costCenterId: ccOps.id,
        producerId: prodMaria.id,
        insuredName: 'La Segunda',
        assetIds: [],
        beneficiaryDescription: '12 empleados del área operativa',
        startDate: d('2024-03-01'),
        endDate: d('2025-02-28'),
        premium: 68000,
        currency: 'ARS',
        description: 'AP para 12 empleados. Póliza vencida, pendiente de renovación urgente.',
        coverageIds: [covAPMuerte.id, covAPITP.id, covAPGastosMedicos.id, covAPSepelio.id],
      },
    }),
    // Vigente — 2 activos agrícolas
    prisma.policy.create({
      data: {
        policyNumber: 'SB-MAG-2026-007890',
        insuranceTypeId: tipoMultiRiesgo.id,
        companyId: compCampoNorte.id,
        costCenterId: ccOps.id,
        producerId: prodCarlos.id,
        insuredName: 'Sancor Seguros',
        assetIds: [actCosechadora.id, actSembradora.id],
        startDate: d('2026-06-01'),
        endDate: d('2027-05-31'),
        premium: 520000,
        currency: 'ARS',
        description: 'Multirriesgo agropecuario. Cosechadora y sembradora, campaña 2026/27.',
        coverageIds: [covGranizoCosecha.id, covRoturaMaquinaria.id, covViento.id],
      },
    }),
    // Vigente — transporte granos
    prisma.policy.create({
      data: {
        policyNumber: 'LS-TRA-2026-011000',
        insuranceTypeId: tipoTransporte.id,
        companyId: compLogisticaOD.id,
        costCenterId: ccLogistica.id,
        producerId: prodJuan.id,
        insuredName: 'La Segunda',
        assetIds: [actCamion.id],
        startDate: d('2026-01-01'),
        endDate: d('2026-12-31'),
        premium: 180000,
        currency: 'ARS',
        description: 'Transporte de mercancías. Granos a granel zona Córdoba-Buenos Aires.',
        coverageIds: [covTransTodoRiesgo.id, covTransRobo.id, covTransVuelco.id],
      },
    }),
  ])
  console.log('  OK Pólizas (6): vigente x4, próxima x1, vencida x1 | coverageIds reales')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 7 — Tareas de Productores
  // IMPORTANTE: ProducerTask.assetId es String? (campo simple, NO array)
  // ─────────────────────────────────────────────────────────────────────────

  await prisma.producerTask.createMany({
    data: [
      {
        producerId: prodJuan.id,
        title: 'Renovar póliza RC. Vence 14/07/2026',
        description: 'La póliza ZA-RC-2025-009012 vence en 15 días. Gestionar renovación y enviar propuesta al cliente.',
        dueDate: d('2026-07-05'),
        status: 'pendiente',
        priority: 'alta',
        policyId: polRC.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
      {
        producerId: prodJuan.id,
        title: 'Renovar póliza Incendio. Vence 30/06/2026',
        description: 'La póliza LS-INC-2025-001234 vence mañana. Emitir nueva póliza o confirmar renovación automática.',
        dueDate: d('2026-06-29'),
        status: 'en_progreso',
        priority: 'alta',
        policyId: polIncendio.id,
        assetId: actEdificio.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
      {
        producerId: prodJuan.id,
        title: 'Solicitar endoso por ampliación de cobertura. Edificio',
        description: 'El cliente incorporó nueva maquinaria en planta. Solicitar endoso para ampliar suma asegurada.',
        dueDate: d('2026-08-01'),
        status: 'pendiente',
        priority: 'media',
        policyId: polIncendio.id,
        assetId: actEdificio.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
      {
        producerId: prodMaria.id,
        title: 'Cotizar ampliación cobertura automotores',
        description: 'El cliente consulta por incorporar 2 camiones nuevos a la póliza FP-AUT-2026-005678. Solicitar cotización a 3 aseguradoras.',
        dueDate: d('2026-07-07'),
        status: 'pendiente',
        priority: 'alta',
        policyId: polAuto.id,
        assignedTo: 'María Elena Pérez',
      },
      {
        producerId: prodMaria.id,
        title: 'Renovación urgente. Accidentes Personales',
        description: 'La póliza AP venció en febrero 2025 (hace 4 meses). Gestionar renovación retroactiva o emisión de nueva póliza.',
        dueDate: d('2026-06-28'),
        status: 'pendiente',
        priority: 'alta',
        policyId: polAP.id,
        assignedTo: 'María Elena Pérez',
      },
      {
        producerId: prodMaria.id,
        title: 'Enviar documentación para siniestro SIN-2026-00001',
        description: 'Completar dossier del siniestro. Faltan fotos del daño y presupuesto oficial del taller Scania.',
        dueDate: d('2026-07-03'),
        status: 'en_progreso',
        priority: 'alta',
        assetId: actCamion.id,
        assignedTo: 'María Elena Pérez',
      },
      {
        producerId: prodCarlos.id,
        title: 'Verificar condiciones de cosecha. Póliza multirriesgo',
        description: 'Confirmar los cultivos declarados para la campaña 2026/27 y actualizar la suma asegurada si es necesario.',
        dueDate: d('2026-08-15'),
        status: 'pendiente',
        priority: 'media',
        policyId: polMultiRiesgo.id,
        assetId: actCosechadora.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
      {
        producerId: prodCarlos.id,
        title: 'Revisión técnica del silo. Informe de riesgo',
        description: 'Coordinar visita de técnico de Sancor Seguros para inspección del silo. Adjuntar planos y certificado de llenado.',
        dueDate: d('2026-08-30'),
        status: 'pendiente',
        priority: 'baja',
        assetId: actSilo.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
      {
        producerId: prodCarlos.id,
        title: 'Confirmar incorporación de sembradora a multirriesgo',
        description: 'La sembradora Crucianelli fue incorporada a SB-MAG-2026-007890. Verificar suma asegurada y enviar confirmación.',
        dueDate: d('2026-07-14'),
        status: 'completada',
        priority: 'media',
        policyId: polMultiRiesgo.id,
        assetId: actSembradora.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
      {
        producerId: prodJuan.id,
        title: 'Gestionar cuota vencida. Póliza Transporte',
        description: 'La cuota 1 del documento 0001-00015000 venció el 20/06/2026 sin ser abonada. Coordinar pago con área contable.',
        dueDate: d('2026-07-01'),
        status: 'pendiente',
        priority: 'alta',
        policyId: polTransporte.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
    ],
  })
  console.log('  OK Tareas (10). ProducerTask.assetId campo simple correcto')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 8 — Documentos Contables
  // ─────────────────────────────────────────────────────────────────────────

  const [facturaIncendio, facturaAuto, notaDebitoRC, facturaMultiRiesgo, facturaTransporte] = await Promise.all([
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00001234',
        documentType: 'INVOICE',
        documentStatus: 'ISSUED',
        issueDate: d('2025-07-05'),
        netAmount: 280000,
        vatAmount: 58800,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual. Póliza LS-INC-2025-001234',
        insuranceCompany: 'La Segunda',
        paymentStatus: 'PARTIALLY_PAID',
        installments: {
          createMany: {
            data: [
              { installmentNumber: 1, dueDate: d('2025-08-05'), amount: 112933, paymentStatus: 'PAID', paymentDate: d('2025-08-04'), paymentMethod: 'Transferencia bancaria', notes: 'Pagado en término' },
              { installmentNumber: 2, dueDate: d('2025-11-05'), amount: 112933, paymentStatus: 'PAID', paymentDate: d('2025-11-03'), paymentMethod: 'Transferencia bancaria', notes: 'Pagado en término' },
              { installmentNumber: 3, dueDate: d('2026-07-10'), amount: 112934, paymentStatus: 'PENDING' },
            ],
          },
        },
        allocations: {
          create: { policyId: polIncendio.id, allocatedAmount: 338800, allocationPercentage: 100 },
        },
      },
    }),
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00005678',
        documentType: 'INVOICE',
        documentStatus: 'ISSUED',
        issueDate: d('2026-01-05'),
        netAmount: 320000,
        vatAmount: 67200,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual. Póliza FP-AUT-2026-005678',
        insuranceCompany: 'Federación Patronal',
        paymentStatus: 'PENDING',
        installments: {
          createMany: {
            data: [
              { installmentNumber: 1, dueDate: d('2026-06-05'), amount: 193600, paymentStatus: 'PENDING', notes: 'VENCIDA. Gestionar pago urgente' },
              { installmentNumber: 2, dueDate: d('2026-09-05'), amount: 193600, paymentStatus: 'PENDING' },
            ],
          },
        },
        allocations: {
          create: { policyId: polAuto.id, allocatedAmount: 387200, allocationPercentage: 100 },
        },
      },
    }),
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00009012',
        documentType: 'DEBIT_NOTE',
        documentStatus: 'ISSUED',
        issueDate: d('2025-07-20'),
        netAmount: 95000,
        vatAmount: 19950,
        otherTaxesAmount: 2850,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual. Póliza ZA-RC-2025-009012',
        insuranceCompany: 'Zurich Argentina',
        paymentStatus: 'PAID',
        installments: {
          createMany: {
            data: [
              { installmentNumber: 1, dueDate: d('2025-08-15'), amount: 117800, paymentStatus: 'PAID', paymentDate: d('2025-08-13'), paymentMethod: 'E-Cheq', notes: 'E-Cheq N 00123456' },
            ],
          },
        },
        allocations: {
          create: { policyId: polRC.id, allocatedAmount: 117800, allocationPercentage: 100 },
        },
      },
    }),
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00012345',
        documentType: 'INVOICE',
        documentStatus: 'ISSUED',
        issueDate: d('2026-06-05'),
        netAmount: 520000,
        vatAmount: 109200,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima semestral. Póliza SB-MAG-2026-007890',
        insuranceCompany: 'Sancor Seguros',
        paymentStatus: 'PENDING',
        installments: {
          createMany: {
            data: [
              { installmentNumber: 1, dueDate: d('2026-07-15'), amount: 314600, paymentStatus: 'PENDING' },
              { installmentNumber: 2, dueDate: d('2026-08-15'), amount: 314600, paymentStatus: 'PENDING' },
            ],
          },
        },
        allocations: {
          create: { policyId: polMultiRiesgo.id, allocatedAmount: 629200, allocationPercentage: 100 },
        },
      },
    }),
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00015000',
        documentType: 'INVOICE',
        documentStatus: 'ISSUED',
        issueDate: d('2026-01-05'),
        netAmount: 180000,
        vatAmount: 37800,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual. Póliza LS-TRA-2026-011000',
        insuranceCompany: 'La Segunda',
        paymentStatus: 'PENDING',
        installments: {
          createMany: {
            data: [
              { installmentNumber: 1, dueDate: d('2026-06-20'), amount: 108900, paymentStatus: 'PENDING', notes: 'VENCIDA. Coordinar con area contable' },
              { installmentNumber: 2, dueDate: d('2026-09-20'), amount: 108900, paymentStatus: 'PENDING' },
            ],
          },
        },
        allocations: {
          create: { policyId: polTransporte.id, allocatedAmount: 217800, allocationPercentage: 100 },
        },
      },
    }),
  ])

  // Asiento de ajuste de ejemplo — requiere documento vinculado, motivo y signo
  // (ver document-types.ts). Se crea después de los 5 documentos base porque
  // necesita el id real de la factura a la que ajusta.
  await prisma.accountingDocument.create({
    data: {
      documentNumber: '0001-00001234-AJ1',
      documentType: 'ADJUSTMENT_ENTRY',
      documentStatus: 'ISSUED',
      issueDate: d('2026-07-11'),
      // Magnitud siempre positiva — el signo del efecto lo da adjustmentSign,
      // no el monto (ver documents-balance.service.ts).
      netAmount: 934,
      vatAmount: 0,
      otherTaxesAmount: 0,
      currency: 'ARS',
      exchangeRate: 1,
      description: 'Ajuste por diferencia de redondeo en la 3ra cuota',
      insuranceCompany: 'La Segunda',
      paymentStatus: 'NOT_APPLICABLE',
      linkedDocumentId: facturaIncendio.id,
      adjustmentReason: 'ROUNDING_DIFFERENCE',
      adjustmentSign: 'NEGATIVE',
    },
  })

  // Nota de Crédito de ejemplo, aplicada — reduce el saldo de facturaAuto.
  // Se seedea ya APPLIED con su asignación negativa proporcional (100% a
  // polAuto, la misma distribución que tiene la factura original), tal como
  // quedaría si se hubiera aplicado vía POST /documents/:id/apply.
  await prisma.accountingDocument.create({
    data: {
      documentNumber: '0001-00005678-NC1',
      documentType: 'CREDIT_NOTE',
      documentStatus: 'APPLIED',
      issueDate: d('2026-02-10'),
      netAmount: 50000,
      vatAmount: 10500,
      otherTaxesAmount: 0,
      currency: 'ARS',
      exchangeRate: 1,
      description: 'Nota de crédito por corrección de prima',
      insuranceCompany: 'Federación Patronal',
      paymentStatus: 'NOT_APPLICABLE',
      relationType: 'CREDITS',
      linkedDocumentId: facturaAuto.id,
      allocations: {
        create: { policyId: polAuto.id, allocatedAmount: -60500, allocationPercentage: 100 },
      },
    },
  })

  // Refacturación de ejemplo — corrige la factura de la póliza de transporte.
  await prisma.accountingDocument.create({
    data: {
      documentNumber: '0001-00015000-RF1',
      documentType: 'REBILLING',
      documentStatus: 'ISSUED',
      issueDate: d('2026-07-02'),
      netAmount: 180000,
      vatAmount: 37800,
      otherTaxesAmount: 0,
      currency: 'ARS',
      exchangeRate: 1,
      description: 'Refacturación por corrección de importe de la factura original',
      insuranceCompany: 'La Segunda',
      paymentStatus: 'PENDING',
      relationType: 'REPLACES',
      linkedDocumentId: facturaTransporte.id,
      installments: {
        createMany: {
          data: [
            { installmentNumber: 1, dueDate: d('2026-08-02'), amount: 217800, paymentStatus: 'PENDING' },
          ],
        },
      },
    },
  })

  // Endosos de ejemplo — se asocian principalmente a una póliza, no a una
  // factura (ver document-types.ts: ENDORSEMENT.requiresPolicy).
  await prisma.accountingDocument.create({
    data: {
      documentNumber: 'END-2026-000001',
      documentType: 'ENDORSEMENT',
      documentStatus: 'ISSUED',
      issueDate: d('2026-06-15'),
      netAmount: 0,
      vatAmount: 0,
      otherTaxesAmount: 0,
      currency: 'ARS',
      exchangeRate: 1,
      description: 'Corrección de datos del asegurado en la póliza',
      insuranceCompany: 'Sancor Seguros',
      paymentStatus: 'NOT_APPLICABLE',
      relationType: 'ENDORSES',
      policyId: polMultiRiesgo.id,
      endorsementType: 'ADMIN_CORRECTION',
      economicImpactType: 'NO_IMPACT',
      endorsementEffectiveDate: d('2026-06-15'),
    },
  })

  await prisma.accountingDocument.create({
    data: {
      documentNumber: 'END-2026-000002',
      documentType: 'ENDORSEMENT',
      documentStatus: 'ISSUED',
      issueDate: d('2025-07-20'),
      netAmount: 0,
      vatAmount: 0,
      otherTaxesAmount: 0,
      currency: 'ARS',
      exchangeRate: 1,
      description: 'Aumento de suma asegurada — respaldado por la nota de débito emitida',
      insuranceCompany: 'Zurich Argentina',
      paymentStatus: 'NOT_APPLICABLE',
      relationType: 'ENDORSES',
      policyId: polRC.id,
      endorsementType: 'SUM_INSURED_CHANGE',
      economicImpactType: 'INCREASES_COST',
      linkedDocumentId: notaDebitoRC.id,
      endorsementEffectiveDate: d('2025-07-20'),
    },
  })

  console.log('  OK Documentos (10) + Cuotas (11) + Imputaciones (6)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 9 — Matafuegos
  // IMPORTANTE: FireExtinguisher.assetId es String? (campo simple, NO array)
  // ─────────────────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-INC001-A',
        establishment: 'PLANTA',
        assetId: actEdificio.id,
        locationType: 'Edificio',
        location: 'Planta Baja. Pasillo Central',
        type: 'Polvo seco ABC',
        capacity: '10 kg',
        brand: 'Cesa',
        cylinderNumber: 'CIL-10023',
        manufacturingYear: 2020,
        expirationDate: d('2027-03-25'),
        lastRechargeDate: d('2026-03-25'),
        history: {
          create: {
            action: 'recarga',
            date: d('2026-03-25'),
            performedBy: 'Técnico Matafuegos SRL',
            notes: 'Recarga anual. Presion verificada.',
            nextDueDate: d('2027-03-25'),
          },
        },
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-INC002-A',
        establishment: 'PLANTA',
        assetId: actEdificio.id,
        locationType: 'Edificio',
        location: 'Primer Piso. Sala de Servidores',
        type: 'CO2',
        capacity: '6 kg',
        brand: 'Amerex',
        cylinderNumber: 'CIL-20087',
        manufacturingYear: 2019,
        expirationDate: d('2026-09-20'),
        lastRechargeDate: d('2025-09-20'),
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-GAL001-A',
        assetId: actGalpon.id,
        locationType: 'Edificio',
        location: 'Sector de Carga. Puerta Norte',
        type: 'Polvo seco ABC',
        capacity: '6 kg',
        brand: 'Kidde',
        expirationDate: d('2026-07-15'),
        lastRechargeDate: d('2025-07-15'),
        observations: 'Próximo a vencer. Programar recarga antes del 15/07/2026.',
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-LOG001-A',
        locationType: 'Vehículo',
        location: 'Camion Scania R450. Cabina',
        type: 'Polvo seco ABC',
        capacity: '1 kg',
        brand: 'Cesa',
        expirationDate: d('2026-06-15'),
        lastRechargeDate: d('2025-06-15'),
        observations: 'VENCIDO desde el 15/06/2026. Reemplazar de inmediato.',
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-MAQ001-A',
        establishment: 'TALLER',
        assetId: actCosechadora.id,
        locationType: 'Maquinaria',
        location: 'Cosechadora John Deere S770. Cabina del operador',
        type: 'Polvo seco ABC',
        capacity: '2 kg',
        brand: 'Cesa',
        cylinderNumber: 'CIL-30045',
        manufacturingYear: 2015,
        expirationDate: d('2027-01-10'),
        lastRechargeDate: d('2026-01-10'),
      },
    }),
  ])

  // Los matafuegos de arriba usan code hardcodeado (no pasan por fire_ext_code_seq).
  // Resincronizamos la secuencia para que la próxima alta desde la app no colisione con estos.
  await prisma.$executeRawUnsafe(
    `SELECT setval('fire_ext_code_seq', (SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '(\\d+)-A$') AS INTEGER)), 0) FROM fire_extinguishers))`,
  )
  console.log('  OK Matafuegos (5). FireExtinguisher.assetId campo simple correcto')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 10 — Siniestros + Eventos
  // IMPORTANTE: Claim.assetId es String? (campo simple, NO array)
  // ─────────────────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.claim.create({
      data: {
        claimNumber: 'SIN-2026-00001',
        assetId: actCamion.id,
        policyId: polAuto.id,
        claimType: 'Accidente',
        occurrenceDate: d('2026-05-15'),
        reportDate: d('2026-05-16'),
        description: 'Colisión trasera en Ruta Nacional 9 km 45. Daños en paragolpes trasero, sistema de escape y luz de posición.',
        insuranceCompany: 'Federación Patronal',
        ownershipType: 'propio',
        responsiblePersonName: 'Ricardo Fernández',
        status: 'En trámite',
        claimedAmountArs: 380000,
        currency: 'ARS',
        exchangeRate: 1,
        observations: 'Perito asignado: Ing. Marcelo Torres. Taller: Scania Cordoba.',
        events: {
          createMany: {
            data: [
              { type: 'siniestro_creado', description: 'Siniestro registrado en el sistema.', date: d('2026-05-16'), createdBy: 'Sistema' },
              { type: 'estado_cambiado', description: 'Perito inspeccionó el vehículo en taller Scania. Se confirman daños denunciados.', date: d('2026-05-30'), previousStatus: 'denunciado', newStatus: 'en_tramite', createdBy: 'Juan Carlos Rodríguez' },
              { type: 'monto_actualizado', description: 'Pericia confirma monto según informe técnico PT-00456-2026.', date: d('2026-06-10'), amountLabel: 'Monto Reclamado', previousAmount: 0, newAmount: 380000, createdBy: 'Juan Carlos Rodríguez' },
            ],
          },
        },
        expenses: {
          createMany: {
            data: [
              { date: d('2026-05-31'), provider: 'Scania Cordoba', receiptNumber: 'FC-0001-00023456', netAmount: 210000, vatAmount: 44100, otherTaxesAmount: 0 },
              { date: d('2026-06-05'), provider: 'Repuestos del Sur SRL', receiptNumber: 'FC-0003-00005521', netAmount: 95000, vatAmount: 19950, otherTaxesAmount: 0 },
            ],
          },
        },
      },
    }),
    prisma.claim.create({
      data: {
        claimNumber: 'SIN-2026-00002',
        assetId: actCosechadora.id,
        policyId: polMultiRiesgo.id,
        claimType: 'Granizo',
        occurrenceDate: d('2026-06-19'),
        reportDate: d('2026-06-20'),
        description: 'Granizo severo (3 cm de diámetro) causó daños en capó, cilindro de trilla y desgranador delantero.',
        insuranceCompany: 'Sancor Seguros',
        ownershipType: 'propio',
        status: 'Denunciado',
        claimedAmountArs: 0,
        currency: 'ARS',
        exchangeRate: 1,
        observations: 'Aguardando asignación de perito. Estimación preliminar entre $600.000 y $900.000.',
        events: {
          create: {
            type: 'siniestro_creado',
            description: 'Siniestro registrado. Aguardando asignación de perito por Sancor Seguros.',
            date: d('2026-06-20'),
            createdBy: 'Sistema',
          },
        },
      },
    }),
    prisma.claim.create({
      data: {
        claimNumber: 'SIN-2025-00003',
        assetId: actEdificio.id,
        policyId: polIncendio.id,
        claimType: 'Daños eléctricos',
        occurrenceDate: d('2025-11-12'),
        reportDate: d('2025-11-13'),
        description: 'Cortocircuito en tablero eléctrico principal causó incendio parcial. Daños en tablero, cableado y cielorraso.',
        insuranceCompany: 'La Segunda',
        ownershipType: 'terceros',
        thirdPartyInsuranceCompany: 'Provincia Seguros',
        thirdPartyContact: 'Estudio Contable Vecino SRL — contacto@vecinosrl.com.ar',
        thirdPartyInsurerContact: 'Sofía Ramírez — sramirez@provinciaseguros.com.ar',
        status: 'Liquidado',
        claimedAmountArs: 520000,
        realAmountArs: 480000,
        settledAmountArs: 430000,
        deductibleArs: 50000,
        currency: 'ARS',
        exchangeRate: 1,
        observations: 'Liquidado. Deducible aplicado: $50.000. Transferencia acreditada el 20/12/2025.',
        events: {
          createMany: {
            data: [
              { type: 'siniestro_creado', description: 'Siniestro reportado tras incendio parcial en sala eléctrica.', date: d('2025-11-13'), createdBy: 'Sistema' },
              { type: 'estado_cambiado', description: 'Perito constató daños. Estimación inicial: $520.000.', date: d('2025-11-25'), previousStatus: 'denunciado', newStatus: 'en_tramite', createdBy: 'Juan Carlos Rodríguez' },
              { type: 'monto_actualizado', description: 'Pericia definitiva: daños reales $480.000. Liquidación: $430.000 (deducible $50.000).', date: d('2025-12-10'), amountLabel: 'Monto Liquidado', previousAmount: 520000, newAmount: 430000, createdBy: 'Juan Carlos Rodríguez' },
              { type: 'estado_cambiado', description: 'Liquidación aceptada. Transferencia por $430.000 acreditada.', date: d('2025-12-20'), previousStatus: 'en_tramite', newStatus: 'liquidado', createdBy: 'Juan Carlos Rodríguez' },
            ],
          },
        },
      },
    }),
  ])

  // Los siniestros de arriba usan claimNumber hardcodeado (no pasan por claim_number_seq).
  // Resincronizamos la secuencia para que la próxima alta desde la app no colisione con estos.
  await prisma.$executeRawUnsafe(
    `SELECT setval('claim_number_seq', (SELECT COALESCE(MAX(CAST(SUBSTRING("claimNumber" FROM '(\\d+)$') AS INTEGER)), 0) FROM claims))`,
  )
  console.log('  OK Siniestros (3) + Eventos (8). Claim.assetId campo simple correcto')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 11 — Catálogos de Configuración
  // ─────────────────────────────────────────────────────────────────────────

  function catalogBatch(category: string, labels: string[]) {
    return prisma.catalogItem.createMany({
      data: labels.map((label, i) => ({ category, label, sortOrder: i })),
    })
  }

  await Promise.all([
    catalogBatch('insurance_company', [
      'La Segunda', 'Sancor Seguros', 'MAPFRE Argentina', 'Zurich Argentina', 'Allianz Argentina',
      'SMG Seguros', 'Seguros Rivadavia', 'Federación Patronal', 'Galeno Seguros', 'Meridional Seguros',
      'BBVA Seguros', 'Experta Seguros', 'Prevención Seguros', 'Provincia Seguros', 'Nación Seguros', 'Prudencia Seguros',
    ]),
    catalogBatch('asset_fuel_type', ['Diésel', 'Nafta', 'GNC', 'Eléctrico', 'Híbrido']),
    catalogBatch('asset_building_purpose', ['Galpón', 'Depósito', 'Vivienda', 'Oficinas', 'Taller', 'Industrial', 'Producción porcina', 'Producción avícola', 'Tambo', 'Otro']),
    catalogBatch('asset_infrastructure_type', ['Silo', 'Tanque de agua', 'Tanque de combustible', 'Obra civil', 'Alambrado', 'Manga y corral', 'Molino', 'Otro']),
    catalogBatch('asset_silo_content', ['Soja', 'Maíz', 'Trigo', 'Cebada', 'Girasol', 'Sorgo', 'Maní', 'Vacío / disponible', 'Otro']),
    catalogBatch('asset_cargo_species', ['Porcino', 'Bovino', 'Ovino', 'Caprino', 'Avícola', 'Equino', 'Otro']),
    catalogBatch('asset_implement_type', ['Sembradora', 'Arado', 'Rastra', 'Fertilizadora', 'Cincel', 'Rolo', 'Acoplado tolva', 'Acoplado caja', 'Fumigadora', 'Otro']),
    catalogBatch('asset_productive_unit', ['Agrícola Norte', 'Agrícola Sur', 'Ganadería', 'Logística', 'Administración', 'Mantenimiento']),
    catalogBatch('asset_area', ['Producción', 'Administración', 'Logística', 'Comercial', 'Mantenimiento', 'RRHH']),
    catalogBatch('fire_ext_type', ['Polvo seco ABC', 'CO2', 'Agua', 'Espuma', 'Halón']),
    catalogBatch('fire_ext_capacity', ['1 kg', '2 kg', '4 kg', '6 kg', '10 kg', '25 kg', '50 kg']),
    catalogBatch('fire_ext_location_type', ['Vehículo', 'Maquinaria', 'Establecimiento', 'Edificio', 'Infraestructura']),
    catalogBatch('task_type', ['Solicitar cotización', 'Renovar póliza', 'Enviar documentación', 'Gestionar siniestro', 'Solicitar endoso', 'Reclamar documentación', 'Revisar vencimiento', 'Auditoría de activos']),
    catalogBatch('document_payment_method', ['Transferencia bancaria', 'E-Cheq', 'Efectivo', 'Débito automático', 'Otros']),
    catalogBatch('document_currency', ['ARS', 'USD']),
    catalogBatch('claim_type', ['Accidente', 'Robo con violencia', 'Hurto', 'Incendio', 'Granizo', 'Granizo (cosecha)', 'Inundación', 'Daños materiales', 'Daños eléctricos', 'Rotura mecánica', 'Responsabilidad civil', 'Muerte accidental', 'Incapacidad', 'Otro']),
    catalogBatch('claim_status', ['Denunciado', 'En trámite', 'Liquidado', 'Rechazado', 'Cerrado']),
  ])
  console.log('  OK Catálogos (17 categorías)')

  // ─────────────────────────────────────────────────────────────────────────
  // Resumen final
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\nSeed completado exitosamente.')
  console.log('  Empresas: 3 | Centros de Costo: 4 | Tipos de Seguro: 6 + 25 coberturas')
  console.log('  Productores: 3 | Bienes de Uso: 24 | Activos: 8 con Bien de Uso vinculado | Historial valores: 11')
  console.log('  Pólizas: 6 con coverageIds reales | Tareas: 10 | Documentos: 5 + 10 cuotas')
  console.log('  Matafuegos: 5 | Siniestros: 3 + 8 eventos | Catálogos: 18 categorías')
  console.log('  CORRECCIONES: assetId campo simple en Claim, FireExtinguisher y ProducerTask')
}

main()
  .catch((e) => {
    console.error('Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
