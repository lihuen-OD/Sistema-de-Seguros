import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

function staticDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00.000Z').toISOString()
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Limpiando base de datos...')

  // Eliminar en orden correcto (hijos antes que padres)
  await prisma.catalogItem.deleteMany()
  await prisma.claimEvent.deleteMany()
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
  await prisma.assetAllocation.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.costCenter.deleteMany()
  await prisma.insuranceCoverage.deleteMany()
  await prisma.insuranceType.deleteMany()
  await prisma.company.deleteMany()

  console.log('✅ Base limpia. Insertando datos...')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 1 — Entidades base (sin dependencias entre sí)
  // ─────────────────────────────────────────────────────────────────────────

  // ── Empresas ──────────────────────────────────────────────────────────────

  const [compOdwyerSA, compCampoNorte, compLogisticaOD] = await Promise.all([
    prisma.company.create({
      data: {
        name: "Los O'Dwyer S.A.",
        cuit: '30-71234567-8',
        email: 'admin@losodwyer.com',
        phone: '0351-4123456',
        address: 'Av. Vélez Sársfield 3450, Córdoba',
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

  console.log('  ✔ Empresas (3)')

  // ── Centros de Costo ──────────────────────────────────────────────────────

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
      data: { name: 'Agroindústria', code: 'AGR-001', description: 'Procesamiento y almacenamiento de granos' },
    }),
  ])

  console.log('  ✔ Centros de Costo (4)')

  // ── Tipos de Seguro + Coberturas ──────────────────────────────────────────

  const [tipoIncendio, tipoAuto, tipoRC, tipoAP, tipoMultiRiesgo, tipoTransporte] = await Promise.all([
    prisma.insuranceType.create({
      data: {
        name: 'Incendio y Riesgo Afines',
        description: 'Cubre daños por incendio, rayo y explosión en inmuebles y contenido.',
        coverages: {
          createMany: {
            data: [
              { name: 'Incendio', description: 'Daños directos por fuego' },
              { name: 'Rayo', description: 'Daños por descarga eléctrica atmosférica' },
              { name: 'Explosión', description: 'Daños por explosión de cualquier origen' },
              { name: 'Robo de Contenido', description: 'Robo o hurto de bienes asegurados' },
              { name: 'Daños por Agua', description: 'Daños ocasionados por agua de cañerías' },
            ],
          },
        },
      },
    }),
    prisma.insuranceType.create({
      data: {
        name: 'Automotores',
        description: 'Póliza integral para vehículos: RC, daños propios y robo.',
        coverages: {
          createMany: {
            data: [
              { name: 'Responsabilidad Civil', description: 'Daños a terceros (obligatorio)' },
              { name: 'Daños Propios', description: 'Daños al propio vehículo por accidente' },
              { name: 'Robo / Hurto Total', description: 'Robo o hurto total del vehículo' },
              { name: 'Granizo', description: 'Daños por granizo sobre la carrocería' },
              { name: 'Incendio Vehículo', description: 'Incendio total o parcial del rodado' },
            ],
          },
        },
      },
    }),
    prisma.insuranceType.create({
      data: {
        name: 'Responsabilidad Civil',
        description: 'Cubre la responsabilidad civil del asegurado frente a terceros.',
        coverages: {
          createMany: {
            data: [
              { name: 'RC General', description: 'RC por actividades generales de la empresa' },
              { name: 'RC Productos', description: 'RC por productos elaborados o vendidos' },
              { name: 'RC Empleadores', description: 'RC frente a empleados en el trabajo' },
              { name: 'RC Cruzada', description: 'RC recíproca entre empresas del grupo' },
            ],
          },
        },
      },
    }),
    prisma.insuranceType.create({
      data: {
        name: 'Accidentes Personales',
        description: 'Cubre accidentes personales del asegurado y personal a cargo.',
        coverages: {
          createMany: {
            data: [
              { name: 'Muerte Accidental', description: 'Capital por muerte por accidente' },
              { name: 'Incapacidad Total y Permanente', description: 'Capital por ITP' },
              { name: 'Gastos Médicos', description: 'Reembolso de gastos médicos por accidente' },
              { name: 'Sepelio', description: 'Gastos de sepelio por muerte accidental' },
            ],
          },
        },
      },
    }),
    prisma.insuranceType.create({
      data: {
        name: 'Multiriesgo Agropecuario',
        description: 'Cobertura integral para maquinaria agrícola y riesgos del campo.',
        coverages: {
          createMany: {
            data: [
              { name: 'Granizo sobre Cosecha', description: 'Daños por granizo en cultivos asegurados' },
              { name: 'Incendio de Pasturas', description: 'Pérdida de forraje por incendio' },
              { name: 'Rotura de Maquinaria', description: 'Rotura accidental de maquinaria agrícola' },
              { name: 'Viento / Tornado', description: 'Daños estructurales por viento' },
            ],
          },
        },
      },
    }),
    prisma.insuranceType.create({
      data: {
        name: 'Transporte de Mercaderías',
        description: 'Cubre mercaderías en tránsito por vía terrestre.',
        coverages: {
          createMany: {
            data: [
              { name: 'Todo Riesgo en Tránsito', description: 'Cobertura total durante el transporte' },
              { name: 'Robo en Tránsito', description: 'Robo de carga durante el traslado' },
              { name: 'Daños por Vuelco', description: 'Daños a la mercadería por accidente del vehículo' },
            ],
          },
        },
      },
    }),
  ])

  console.log('  ✔ Tipos de Seguro (6) + Coberturas (25)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 2 — Productores y Activos (dependen de empresas/centros de costo)
  // ─────────────────────────────────────────────────────────────────────────

  // ── Productores ───────────────────────────────────────────────────────────

  const [prodJuan, prodMaria, prodCarlos] = await Promise.all([
    prisma.producer.create({
      data: {
        name: 'Juan Carlos Rodríguez',
        email: 'jrodriguez@seguroslo.com.ar',
        phone: '0351-155-123456',
        matricula: 'MAT-12345',
      },
    }),
    prisma.producer.create({
      data: {
        name: 'María Elena Pérez',
        email: 'mperez@seguroslo.com.ar',
        phone: '0351-155-654321',
        matricula: 'MAT-67890',
      },
    }),
    prisma.producer.create({
      data: {
        name: 'Carlos Alberto Méndez',
        email: 'cmendez@productorods.com.ar',
        phone: '03548-155-987654',
        matricula: 'MAT-24680',
      },
    }),
  ])

  console.log('  ✔ Productores (3)')

  // ── Activos ───────────────────────────────────────────────────────────────

  const [actEdificio, actCamion, actCosechadora, actGalpon, actTractor, actSilo] = await Promise.all([
    prisma.asset.create({
      data: {
        code: 'INM-001',
        name: 'Edificio Principal — Planta Córdoba',
        assetType: 'inmueble',
        status: 'activo',
        location: 'Av. Vélez Sársfield 3450, Córdoba',
        area: 'Administración',
        productiveUnit: 'Administración',
        purchaseDate: staticDate('2010-03-15'),
        purchaseValue: 8000000,
        currentValue: 15000000,
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
        name: 'Camión Scania R450 — Patente AB 123 CD',
        assetType: 'vehiculo',
        status: 'activo',
        brand: 'Scania',
        model: 'R450',
        year: 2021,
        serialNumber: '9BSR6X4006B412345',
        purchaseDate: staticDate('2021-08-01'),
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
        name: 'Cosechadora John Deere S770',
        assetType: 'maquinaria_agricola',
        status: 'activo',
        brand: 'John Deere',
        model: 'S770',
        year: 2022,
        serialNumber: '1H0S770SRLN123456',
        purchaseDate: staticDate('2022-04-10'),
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
        name: 'Galpón de Almacenamiento — Depósito Norte',
        assetType: 'inmueble',
        status: 'activo',
        location: 'Ruta 9 km 12, Jesús María, Córdoba',
        area: 'Logística',
        productiveUnit: 'Agrícola Norte',
        purchaseDate: staticDate('2015-06-20'),
        purchaseValue: 2500000,
        currentValue: 3500000,
        description: 'Galpón metálico 800 m² con cámara de frío. Uso logístico.',
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
        name: 'Tractor John Deere 6135B',
        assetType: 'vehiculo',
        status: 'activo',
        brand: 'John Deere',
        model: '6135B',
        year: 2020,
        serialNumber: 'PY6135B654321',
        purchaseDate: staticDate('2020-11-05'),
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
        name: 'Silo Metálico 1500 tn — Jesús María',
        assetType: 'silo',
        status: 'activo',
        location: 'Ruta 9 km 12, Jesús María, Córdoba',
        area: 'Producción',
        productiveUnit: 'Agrícola Norte',
        purchaseDate: staticDate('2018-03-01'),
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
  ])

  console.log('  ✔ Activos (6) + Imputaciones')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 3 — Pólizas (dependen de todo lo anterior)
  // ─────────────────────────────────────────────────────────────────────────

  const [polIncendio, polAuto, polRC, polAP, polMultiRiesgo] = await Promise.all([
    prisma.policy.create({
      data: {
        policyNumber: 'LS-INC-2024-001234',
        insuranceTypeId: tipoIncendio.id,
        companyId: compOdwyerSA.id,
        costCenterId: ccAdmin.id,
        producerId: prodJuan.id,
        insuredName: "Los O'Dwyer S.A.",
        assetId: actEdificio.id,
        startDate: isoDate(-180),
        endDate: isoDate(185),
        premium: 280000,
        currency: 'ARS',
        description: 'Cobertura integral edificio y contenido — Planta Córdoba.',
        coverageIds: [],
      },
    }),
    prisma.policy.create({
      data: {
        policyNumber: 'FP-AUT-2025-005678',
        insuranceTypeId: tipoAuto.id,
        companyId: compLogisticaOD.id,
        costCenterId: ccLogistica.id,
        producerId: prodMaria.id,
        insuredName: 'Logística OD S.A.',
        assetId: actCamion.id,
        startDate: isoDate(-60),
        endDate: isoDate(305),
        premium: 145000,
        currency: 'ARS',
        description: 'Póliza todo riesgo — Scania R450 AB 123 CD.',
        coverageIds: [],
      },
    }),
    prisma.policy.create({
      data: {
        policyNumber: 'ZA-RC-2024-009012',
        insuranceTypeId: tipoRC.id,
        companyId: compOdwyerSA.id,
        costCenterId: ccAdmin.id,
        producerId: prodJuan.id,
        insuredName: "Los O'Dwyer S.A.",
        startDate: isoDate(-350),
        endDate: isoDate(15),
        premium: 95000,
        currency: 'ARS',
        description: 'RC General para actividades industriales y logísticas.',
        coverageIds: [],
      },
    }),
    prisma.policy.create({
      data: {
        policyNumber: 'LS-AP-2023-003456',
        insuranceTypeId: tipoAP.id,
        companyId: compCampoNorte.id,
        costCenterId: ccOps.id,
        producerId: prodMaria.id,
        insuredName: 'Campo Norte S.R.L.',
        beneficiaryDescription: '12 empleados del área operativa',
        startDate: isoDate(-400),
        endDate: isoDate(-35),
        premium: 68000,
        currency: 'ARS',
        description: 'AP para 12 empleados — requiere renovación urgente.',
        coverageIds: [],
      },
    }),
    prisma.policy.create({
      data: {
        policyNumber: 'SB-MAG-2025-007890',
        insuranceTypeId: tipoMultiRiesgo.id,
        companyId: compCampoNorte.id,
        costCenterId: ccOps.id,
        producerId: prodCarlos.id,
        insuredName: 'Campo Norte S.R.L.',
        assetId: actCosechadora.id,
        startDate: isoDate(-30),
        endDate: isoDate(335),
        premium: 520000,
        currency: 'ARS',
        description: 'Multiriesgo agropecuario — maquinaria e instalaciones campaña 2025/26.',
        coverageIds: [],
      },
    }),
  ])

  console.log('  ✔ Pólizas (5) — vigente×3, proxima×1, vencida×1')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 4 — Tareas (ahora pueden referenciar pólizas y activos)
  // ─────────────────────────────────────────────────────────────────────────

  await prisma.producerTask.createMany({
    data: [
      // Tareas de Juan Rodríguez
      {
        producerId: prodJuan.id,
        title: 'Renovar póliza RC antes del vencimiento',
        description: 'La póliza ZA-RC-2024-009012 vence en menos de 15 días. Gestionar renovación y enviar propuesta al cliente.',
        dueDate: isoDate(10),
        status: 'pendiente',
        priority: 'alta',
        policyId: polRC.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
      {
        producerId: prodJuan.id,
        title: 'Auditoría anual de activos asegurados',
        description: 'Revisar valuación de activos con el área contable. Verificar que los valores asegurados estén actualizados.',
        dueDate: isoDate(20),
        status: 'en_progreso',
        priority: 'media',
        assignedTo: 'Juan Carlos Rodríguez',
      },
      {
        producerId: prodJuan.id,
        title: 'Solicitar endoso por ampliación de cobertura — Edificio',
        description: 'El cliente incorporó nueva maquinaria en planta. Solicitar endoso para ampliar suma asegurada.',
        dueDate: isoDate(35),
        status: 'pendiente',
        priority: 'media',
        policyId: polIncendio.id,
        assetId: actEdificio.id,
        assignedTo: 'Juan Carlos Rodríguez',
      },
      // Tareas de María Pérez
      {
        producerId: prodMaria.id,
        title: 'Cotizar ampliación cobertura automotores',
        description: 'El cliente agregó 2 vehículos nuevos a la flota. Solicitar cotización a 3 aseguradoras.',
        dueDate: isoDate(7),
        status: 'pendiente',
        priority: 'alta',
        policyId: polAuto.id,
        assignedTo: 'María Elena Pérez',
      },
      {
        producerId: prodMaria.id,
        title: 'Renovación urgente — Accidentes Personales',
        description: 'La póliza AP venció hace 35 días. Gestionar renovación retroactiva o emisión de nueva póliza.',
        dueDate: isoDate(-2),
        status: 'pendiente',
        priority: 'alta',
        policyId: polAP.id,
        assignedTo: 'María Elena Pérez',
      },
      {
        producerId: prodMaria.id,
        title: 'Enviar documentación para siniestro en trámite',
        description: 'Completar dossier del siniestro SIN-2026-00001. Faltan fotos del daño y presupuesto del taller.',
        dueDate: isoDate(3),
        status: 'en_progreso',
        priority: 'alta',
        assetId: actCamion.id,
        assignedTo: 'María Elena Pérez',
      },
      // Tareas de Carlos Méndez
      {
        producerId: prodCarlos.id,
        title: 'Verificar condiciones de cosecha — póliza multiriesgo',
        description: 'Confirmar con el cliente los cultivos declarados para la campaña 2025/26 y actualizar la suma asegurada.',
        dueDate: isoDate(45),
        status: 'pendiente',
        priority: 'media',
        policyId: polMultiRiesgo.id,
        assetId: actCosechadora.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
      {
        producerId: prodCarlos.id,
        title: 'Revisión técnica del silo — informe de riesgo',
        description: 'Coordinar visita de técnico de la aseguradora para inspección del silo. Adjuntar planos al expediente.',
        dueDate: isoDate(60),
        status: 'pendiente',
        priority: 'baja',
        assetId: actSilo.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
      {
        producerId: prodCarlos.id,
        title: 'Propuesta de seguro para tractor nuevo',
        description: 'Cliente consultó por incorporar el Tractor 6135B a la cobertura multiriesgo. Preparar propuesta.',
        dueDate: isoDate(14),
        status: 'completada',
        priority: 'media',
        assetId: actTractor.id,
        assignedTo: 'Carlos Alberto Méndez',
      },
    ],
  })

  console.log('  ✔ Tareas (9) — vinculadas a productores, pólizas y activos')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 5 — Documentos Contables + Cuotas + Imputaciones
  // ─────────────────────────────────────────────────────────────────────────

  await Promise.all([
    // Doc 1 — Factura incendio, pago parcial
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00001234',
        documentType: 'factura',
        issueDate: isoDate(-60),
        netAmount: 280000,
        vatAmount: 58800,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual — Póliza LS-INC-2024-001234',
        insuranceCompany: 'La Segunda Seguros',
        paymentStatus: 'parcial',
        installments: {
          createMany: {
            data: [
              {
                installmentNumber: 1,
                dueDate: isoDate(-30),
                amount: 112933,
                paymentStatus: 'pagado',
                paymentDate: isoDate(-28),
                paymentMethod: 'transferencia',
                notes: 'Pagado en término',
              },
              {
                installmentNumber: 2,
                dueDate: isoDate(10),
                amount: 112933,
                paymentStatus: 'pendiente',
              },
              {
                installmentNumber: 3,
                dueDate: isoDate(40),
                amount: 112934,
                paymentStatus: 'pendiente',
              },
            ],
          },
        },
        allocations: {
          create: {
            policyId: polIncendio.id,
            allocatedAmount: 338800,
            allocationPercentage: 100,
          },
        },
      },
    }),
    // Doc 2 — Cuota vencida sin pagar
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00005678',
        documentType: 'factura',
        issueDate: isoDate(-30),
        netAmount: 145000,
        vatAmount: 30450,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima — Póliza FP-AUT-2025-005678',
        insuranceCompany: 'Federación Patronal Seguros',
        paymentStatus: 'pendiente',
        installments: {
          createMany: {
            data: [
              {
                installmentNumber: 1,
                dueDate: isoDate(-10),
                amount: 175450,
                paymentStatus: 'pendiente',
                notes: 'VENCIDA — gestionar pago urgente',
              },
            ],
          },
        },
        allocations: {
          create: {
            policyId: polAuto.id,
            allocatedAmount: 175450,
            allocationPercentage: 100,
          },
        },
      },
    }),
    // Doc 3 — Nota de débito RC pagada
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00009012',
        documentType: 'nota_debito',
        issueDate: isoDate(-90),
        netAmount: 95000,
        vatAmount: 19950,
        otherTaxesAmount: 2850,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima — Póliza ZA-RC-2024-009012',
        insuranceCompany: 'Zurich Argentina',
        paymentStatus: 'pagado',
        installments: {
          createMany: {
            data: [
              {
                installmentNumber: 1,
                dueDate: isoDate(-60),
                amount: 117800,
                paymentStatus: 'pagado',
                paymentDate: isoDate(-58),
                paymentMethod: 'echeq',
              },
            ],
          },
        },
        allocations: {
          create: {
            policyId: polRC.id,
            allocatedAmount: 117800,
            allocationPercentage: 100,
          },
        },
      },
    }),
    // Doc 4 — Multiriesgo, 2 cuotas pendientes
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00012345',
        documentType: 'factura',
        issueDate: isoDate(-30),
        netAmount: 520000,
        vatAmount: 109200,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima semestral — Póliza SB-MAG-2025-007890',
        insuranceCompany: 'Sancor Seguros',
        paymentStatus: 'pendiente',
        installments: {
          createMany: {
            data: [
              {
                installmentNumber: 1,
                dueDate: isoDate(15),
                amount: 314600,
                paymentStatus: 'pendiente',
              },
              {
                installmentNumber: 2,
                dueDate: isoDate(45),
                amount: 314600,
                paymentStatus: 'pendiente',
              },
            ],
          },
        },
        allocations: {
          create: {
            policyId: polMultiRiesgo.id,
            allocatedAmount: 629200,
            allocationPercentage: 100,
          },
        },
      },
    }),
  ])

  console.log('  ✔ Documentos (4) + Cuotas (7) + Imputaciones (4)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 6 — Matafuegos
  // ─────────────────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-INC001-A',
        assetId: actEdificio.id,
        locationType: 'activo',
        location: 'Planta Baja — Pasillo Central',
        type: 'polvo_abc',
        capacity: '10kg',
        brand: 'Cesa',
        expirationDate: isoDate(270),
        lastRechargeDate: isoDate(-95),
        history: {
          create: {
            action: 'recarga',
            date: isoDate(-95),
            performedBy: 'Técnico Matafuegos SRL',
            notes: 'Recarga anual según normativa vigente.',
            nextDueDate: isoDate(270),
          },
        },
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-INC002-A',
        assetId: actEdificio.id,
        locationType: 'activo',
        location: 'Primer Piso — Sala de Servidores',
        type: 'co2',
        capacity: '5kg',
        brand: 'Amerex',
        expirationDate: isoDate(20),
        lastRechargeDate: isoDate(-345),
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-GAL001-A',
        assetId: actGalpon.id,
        locationType: 'activo',
        location: 'Sector de Carga — Puerta Norte',
        type: 'polvo_abc',
        capacity: '6kg',
        brand: 'Kidde',
        expirationDate: isoDate(-15),
        lastRechargeDate: isoDate(-380),
        observations: 'VENCIDO — programar recarga con urgencia.',
      },
    }),
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-LOG001-A',
        locationType: 'vehiculo',
        location: 'Camión Scania R450 — Cabina',
        type: 'polvo_abc',
        capacity: '1kg',
        brand: 'Cesa',
        expirationDate: isoDate(180),
        lastRechargeDate: isoDate(-185),
      },
    }),
  ])

  console.log('  ✔ Matafuegos (4) — vigente×2, próximo×1, vencido×1')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 7 — Siniestros + Eventos
  // ─────────────────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.claim.create({
      data: {
        claimNumber: 'SIN-2026-00001',
        assetId: actCamion.id,
        policyId: polAuto.id,
        claimType: 'accidente',
        occurrenceDate: isoDate(-45),
        reportDate: isoDate(-44),
        description: 'Colisión trasera en Ruta Nacional 9. Daños en paragolpes trasero y sistema de escape.',
        insuranceCompany: 'Federación Patronal Seguros',
        status: 'en_tramite',
        claimedAmountArs: 380000,
        currency: 'ARS',
        exchangeRate: 1,
        events: {
          createMany: {
            data: [
              {
                type: 'siniestro_creado',
                description: 'Siniestro registrado en el sistema.',
                date: isoDate(-44),
                createdBy: 'Sistema',
              },
              {
                type: 'estado_cambiado',
                description: 'Perito de la aseguradora realizó inspección del vehículo.',
                date: isoDate(-30),
                previousStatus: 'denunciado',
                newStatus: 'en_tramite',
                createdBy: 'Juan Carlos Rodríguez',
              },
              {
                type: 'monto_actualizado',
                description: 'Perito confirmó monto de daños según informe técnico.',
                date: isoDate(-20),
                amountLabel: 'Monto Reclamado',
                previousAmount: 0,
                newAmount: 380000,
                createdBy: 'Juan Carlos Rodríguez',
              },
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
        claimType: 'granizo',
        occurrenceDate: isoDate(-10),
        reportDate: isoDate(-9),
        description: 'Granizo severo causó daños en capó y sistema de cosecha. Estimación preliminar en proceso.',
        insuranceCompany: 'Sancor Seguros',
        status: 'denunciado',
        claimedAmountArs: 0,
        currency: 'ARS',
        exchangeRate: 1,
        observations: 'Esperando visita del perito asignado.',
        events: {
          create: {
            type: 'siniestro_creado',
            description: 'Siniestro registrado. Aguardando asignación de perito.',
            date: isoDate(-9),
            createdBy: 'Sistema',
          },
        },
      },
    }),
  ])

  console.log('  ✔ Siniestros (2) + Eventos (4)')

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 8 — Configuración de Módulos (catálogos dinámicos)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('  📋 Insertando catálogos de configuración...')

  function catalogBatch(category: string, labels: string[]) {
    return prisma.catalogItem.createMany({
      data: labels.map((label, i) => ({ category, label, sortOrder: i })),
    })
  }

  await Promise.all([
    // Aseguradoras
    catalogBatch('insurance_company', [
      'La Segunda', 'Sancor Seguros', 'MAPFRE', 'Zurich', 'Allianz',
      'SMG Seguros', 'Seguros Rivadavia', 'Federación Patronal', 'Galeno', 'Meridional',
    ]),
    // Activos — vehículos
    catalogBatch('asset_fuel_type', ['Diésel', 'Nafta', 'GNC', 'Eléctrico', 'Híbrido']),
    // Activos — inmuebles
    catalogBatch('asset_building_purpose', [
      'Galpón', 'Depósito', 'Vivienda', 'Oficinas', 'Taller',
      'Industrial', 'Producción porcina', 'Producción avícola', 'Otro',
    ]),
    // Activos — infraestructura
    catalogBatch('asset_infrastructure_type', [
      'Silo', 'Tanque de agua', 'Tanque de combustible',
      'Obra civil', 'Alambrado', 'Manga y corral', 'Otro',
    ]),
    // Activos — silos
    catalogBatch('asset_silo_content', [
      'Soja', 'Maíz', 'Trigo', 'Cebada', 'Girasol',
      'Sorgo', 'Maní', 'Vacío / disponible', 'Otro',
    ]),
    // Activos — ganadería
    catalogBatch('asset_cargo_species', [
      'Porcino', 'Bovino', 'Ovino', 'Caprino', 'Avícola', 'Equino', 'Otro',
    ]),
    // Activos — implementos
    catalogBatch('asset_implement_type', [
      'Sembradora', 'Arado', 'Rastra', 'Fertilizadora',
      'Cincel', 'Rolo', 'Acoplado', 'Otro',
    ]),
    // Activos — unidades productivas y áreas
    catalogBatch('asset_productive_unit', [
      'Agrícola Norte', 'Agrícola Sur', 'Ganadería',
      'Logística', 'Administración', 'Mantenimiento',
    ]),
    catalogBatch('asset_area', [
      'Producción', 'Administración', 'Logística',
      'Comercial', 'Mantenimiento', 'RRHH',
    ]),
    // Matafuegos
    catalogBatch('fire_ext_type', ['Polvo seco ABC', 'CO2', 'Agua', 'Espuma', 'Halón']),
    catalogBatch('fire_ext_capacity', ['1 kg', '2 kg', '4 kg', '6 kg', '10 kg', '25 kg', '50 kg']),
    catalogBatch('fire_ext_location_type', ['Vehículo', 'Maquinaria', 'Establecimiento', 'Edificio', 'Infraestructura']),
    // Tareas
    catalogBatch('task_type', [
      'Solicitar cotización', 'Renovar póliza', 'Enviar documentación',
      'Gestionar siniestro', 'Solicitar endoso', 'Reclamar documentación', 'Revisar vencimiento',
    ]),
    // Documentos
    catalogBatch('document_type', ['Factura', 'Nota de Crédito', 'Nota de Débito', 'Endoso', 'Refacturación']),
    catalogBatch('document_payment_method', [
      'Transferencia bancaria', 'E-Cheq', 'Efectivo', 'Débito automático', 'Otros',
    ]),
    catalogBatch('document_currency', ['ARS', 'USD']),
    // Siniestros
    catalogBatch('claim_type', [
      'Accidente', 'Robo con violencia', 'Hurto', 'Incendio',
      'Granizo', 'Granizo (cosecha)', 'Inundación', 'Daños materiales',
      'Daños eléctricos', 'Rotura mecánica', 'Responsabilidad civil',
      'Muerte accidental', 'Incapacidad', 'Otro',
    ]),
    catalogBatch('claim_status', [
      'Denunciado', 'En trámite', 'Liquidado', 'Rechazado', 'Cerrado',
    ]),
  ])

  console.log('  ✔ Catálogos de configuración (17 categorías)')

  // ─────────────────────────────────────────────────────────────────────────
  // Resumen final
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n🎉 Seed completado exitosamente.')
  console.log('\n📊 Resumen por módulo:')
  console.log('   🏢 Empresas            → 3 (Los O\'Dwyer SA, Campo Norte SRL, Logística OD SA)')
  console.log('   💰 Centros de Costo    → 4 (Administración, Operaciones, Logística, Agroindustria)')
  console.log('   🛡️  Tipos de Seguro     → 6 + 25 coberturas')
  console.log('   👤 Productores         → 3 (Juan Rodríguez, María Pérez, Carlos Méndez)')
  console.log('   ✅ Tareas              → 9 vinculadas a productores, pólizas y activos')
  console.log('   📦 Activos             → 6 (inmuebles, vehículos, maquinaria, silo)')
  console.log('   📋 Pólizas             → 5 (vigente×3, próxima×1, vencida×1)')
  console.log('   📄 Documentos          → 4 + 7 cuotas + 4 imputaciones')
  console.log('   🔥 Matafuegos          → 4 (vigente×2, próximo×1, vencido×1)')
  console.log('   ⚠️  Siniestros          → 2 + 4 eventos')
  console.log('   ⚙️  Config. de módulos  → 17 categorías de catálogos')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
