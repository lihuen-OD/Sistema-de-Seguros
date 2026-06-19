import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Limpiando base de datos...')

  // Eliminar en orden correcto (hijos antes que padres)
  await prisma.catalogItem.deleteMany()
  await prisma.claim.deleteMany()                     // cascade → ClaimEvent
  await prisma.fireExtinguisher.deleteMany()          // cascade → FireExtinguisherHistory
  await prisma.documentPolicyAllocation.deleteMany()  // libera FK a Policy
  await prisma.accountingDocument.deleteMany()        // cascade → DocumentInstallment, DocumentAttachment
  await prisma.policy.deleteMany()                    // cascade → PolicyAttachment
  await prisma.assetAllocation.deleteMany()           // libera FK a CostCenter
  await prisma.asset.deleteMany()                     // cascade → AssetValueHistory, AssetAttachment
  await prisma.producer.deleteMany()                  // cascade → ProducerTask
  await prisma.costCenter.deleteMany()
  await prisma.insuranceType.deleteMany()             // cascade → InsuranceCoverage
  await prisma.company.deleteMany()

  console.log('✅ Base limpia. Insertando datos...')

  // ── Companies ──────────────────────────────────────────────────────────────

  const [laSegunda, federacion, zurich] = await Promise.all([
    prisma.company.create({
      data: {
        name: 'La Segunda Seguros',
        cuit: '30-50002306-7',
        email: 'contacto@lasegunda.com.ar',
        phone: '0800-444-7273',
        address: 'Bv. Oroño 1260, Rosario, Santa Fe',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Federación Patronal Seguros',
        cuit: '30-50000029-1',
        email: 'info@fedpat.com.ar',
        phone: '0800-222-3327',
        address: 'Av. Rivadavia 1255, Buenos Aires',
      },
    }),
    prisma.company.create({
      data: {
        name: 'Zurich Argentina',
        cuit: '30-50000022-4',
        email: 'info@zurich.com.ar',
        phone: '0800-333-7447',
        address: 'Av. Leandro N. Alem 855, Buenos Aires',
      },
    }),
  ])

  console.log('  ✔ Companies (3)')

  // ── Cost Centers ───────────────────────────────────────────────────────────

  const [ccAdmin, ccOps, ccLogistica] = await Promise.all([
    prisma.costCenter.create({ data: { name: 'Administración Central', code: 'ADM-001' } }),
    prisma.costCenter.create({ data: { name: 'Operaciones Campo', code: 'OPS-001' } }),
    prisma.costCenter.create({ data: { name: 'Logística y Transporte', code: 'LOG-001' } }),
  ])

  console.log('  ✔ Cost Centers (3)')

  // ── Insurance Types + coverages ────────────────────────────────────────────

  const [tipoIncendio, tipoAuto, tipoRC, tipoAP] = await Promise.all([
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
            ],
          },
        },
      },
    }),
  ])

  console.log('  ✔ Insurance Types (4) + Coverages (14)')

  // ── Producers ─────────────────────────────────────────────────────────────

  const [prodJuan, prodMaria] = await Promise.all([
    prisma.producer.create({
      data: {
        name: 'Juan Carlos Rodríguez',
        email: 'jrodriguez@seguroslo.com.ar',
        phone: '0351-155-123456',
        matricula: 'MAT-12345',
        tasks: {
          createMany: {
            data: [
              {
                title: 'Renovar póliza RC vencida',
                description: 'Gestionar la renovación antes del cierre de mes.',
                dueDate: isoDate(-3),
                status: 'pendiente',
              },
              {
                title: 'Auditoría anual de activos asegurados',
                description: 'Revisar valuación de activos con el cliente.',
                dueDate: isoDate(15),
                status: 'en_curso',
              },
            ],
          },
        },
      },
    }),
    prisma.producer.create({
      data: {
        name: 'María Elena Pérez',
        email: 'mperez@seguroslo.com.ar',
        phone: '0351-155-654321',
        matricula: 'MAT-67890',
        tasks: {
          createMany: {
            data: [
              {
                title: 'Cotizar ampliación cobertura automotores',
                description: 'El cliente agregó 2 vehículos nuevos.',
                dueDate: isoDate(7),
                status: 'pendiente',
              },
            ],
          },
        },
      },
    }),
  ])

  console.log('  ✔ Producers (2) + Tasks (3)')

  // ── Assets ────────────────────────────────────────────────────────────────

  const [actEdificio, actCamion, actCosechadora, actGalpon] = await Promise.all([
    prisma.asset.create({
      data: {
        name: 'Edificio Principal — Planta Córdoba',
        assetType: 'inmueble',
        brand: null,
        model: null,
        location: 'Av. Vélez Sársfield 3450, Córdoba',
        purchaseDate: '2010-03-15',
        purchaseValue: 8000000,
        currentValue: 15000000,
        description: 'Edificio de oficinas y planta de procesamiento. 1200 m² cubiertos.',
        allocations: {
          createMany: {
            data: [
              { costCenterId: ccAdmin.id, percentage: 60 },
              { costCenterId: ccOps.id, percentage: 40 },
            ],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        name: 'Camión Scania R450 — Patente AB 123 CD',
        assetType: 'vehiculo',
        brand: 'Scania',
        model: 'R450',
        serialNumber: '9BSR6X4006B412345',
        purchaseDate: '2021-08-01',
        purchaseValue: 7000000,
        currentValue: 8500000,
        location: 'Planta Córdoba',
        allocations: {
          createMany: {
            data: [{ costCenterId: ccLogistica.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        name: 'Cosechadora John Deere S770',
        assetType: 'maquinaria_agricola',
        brand: 'John Deere',
        model: 'S770',
        serialNumber: '1H0S770SRLN123456',
        purchaseDate: '2022-04-10',
        purchaseValue: 38000000,
        currentValue: 45000000,
        description: 'Cosechadora de gran porte para uso agrícola extensivo.',
        allocations: {
          createMany: {
            data: [{ costCenterId: ccOps.id, percentage: 100 }],
          },
        },
      },
    }),
    prisma.asset.create({
      data: {
        name: 'Galpón de Almacenamiento — Depósito Norte',
        assetType: 'inmueble',
        location: 'Ruta 9 km 12, Jesús María, Córdoba',
        purchaseDate: '2015-06-20',
        purchaseValue: 2500000,
        currentValue: 3500000,
        description: 'Galpón metálico 800 m² con cámara de frío. Uso logístico.',
        allocations: {
          createMany: {
            data: [
              { costCenterId: ccLogistica.id, percentage: 70 },
              { costCenterId: ccOps.id, percentage: 30 },
            ],
          },
        },
      },
    }),
  ])

  console.log('  ✔ Assets (4) + Allocations')

  // ── Policies ──────────────────────────────────────────────────────────────

  const [polIncendio, polAuto, polRC, polAP] = await Promise.all([
    // Póliza vigente — Incendio Edificio
    prisma.policy.create({
      data: {
        policyNumber: 'LS-INC-2024-001234',
        insuranceTypeId: tipoIncendio.id,
        companyId: laSegunda.id,
        producerId: prodJuan.id,
        insuredName: 'LOS O\'DWYER S.A.',
        startDate: isoDate(-180),
        endDate: isoDate(185),
        premium: 280000,
        currency: 'ARS',
        description: 'Cobertura integral edificio y contenido — Planta Córdoba.',
        coverageIds: [],
      },
    }),
    // Póliza vigente — Automotores Camión
    prisma.policy.create({
      data: {
        policyNumber: 'FP-AUT-2025-005678',
        insuranceTypeId: tipoAuto.id,
        companyId: federacion.id,
        producerId: prodMaria.id,
        insuredName: 'LOS O\'DWYER S.A.',
        startDate: isoDate(-60),
        endDate: isoDate(305),
        premium: 145000,
        currency: 'ARS',
        description: 'Póliza todo riesgo — Scania R450 AB 123 CD.',
        coverageIds: [],
      },
    }),
    // Póliza próxima a vencer — RC General
    prisma.policy.create({
      data: {
        policyNumber: 'ZA-RC-2024-009012',
        insuranceTypeId: tipoRC.id,
        companyId: zurich.id,
        producerId: prodJuan.id,
        insuredName: 'LOS O\'DWYER S.A.',
        startDate: isoDate(-350),
        endDate: isoDate(15),   // vence en 15 días → proxima_a_vencer
        premium: 95000,
        currency: 'ARS',
        description: 'RC General para actividades industriales y logísticas.',
        coverageIds: [],
      },
    }),
    // Póliza vencida — Accidentes Personales
    prisma.policy.create({
      data: {
        policyNumber: 'LS-AP-2023-003456',
        insuranceTypeId: tipoAP.id,
        companyId: laSegunda.id,
        producerId: prodMaria.id,
        insuredName: 'LOS O\'DWYER S.A.',
        startDate: isoDate(-400),
        endDate: isoDate(-35),  // venció hace 35 días → vencida
        premium: 68000,
        currency: 'ARS',
        description: 'AP para 12 empleados — requiere renovación urgente.',
        coverageIds: [],
      },
    }),
  ])

  console.log('  ✔ Policies (4) — vigente×2, proxima×1, vencida×1')

  // ── Accounting Documents + Installments ───────────────────────────────────

  await Promise.all([
    // Doc 1 — Factura emitida hace 60 días, 3 cuotas
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00001234',
        documentType: 'Factura',
        issueDate: isoDate(-60),
        netAmount: 280000,
        vatAmount: 58800,
        otherTaxesAmount: 0,
        currency: 'ARS',
        exchangeRate: 1,
        description: 'Prima anual — Póliza LS-INC-2024-001234',
        insuranceCompany: 'La Segunda Seguros',
        paymentStatus: 'pagado_parcial',
        installments: {
          createMany: {
            data: [
              {
                installmentNumber: 1,
                dueDate: isoDate(-30),
                amount: 112933,
                paymentStatus: 'pagado',
                paymentDate: isoDate(-28),
                paymentMethod: 'Transferencia bancaria',
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
    // Doc 2 — Factura con cuota vencida sin pagar
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00005678',
        documentType: 'Factura',
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
                dueDate: isoDate(-10),  // vencida, sin pagar
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
    // Doc 3 — Nota de débito RC, pagada completamente
    prisma.accountingDocument.create({
      data: {
        documentNumber: '0001-00009012',
        documentType: 'Nota de Débito',
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
                paymentMethod: 'E-Cheq',
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
  ])

  console.log('  ✔ Documents (3) + Installments (5) + Allocations (3)')

  // ── Fire Extinguishers ────────────────────────────────────────────────────

  await Promise.all([
    // Vigente — Edificio
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
    // Próximo a vencer — Edificio piso 1
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-INC002-A',
        assetId: actEdificio.id,
        locationType: 'activo',
        location: 'Primer Piso — Sala de Servidores',
        type: 'co2',
        capacity: '5kg',
        brand: 'Amerex',
        expirationDate: isoDate(20),  // vence en 20 días → proximo_vencer
        lastRechargeDate: isoDate(-345),
      },
    }),
    // Vencido — Galpón
    prisma.fireExtinguisher.create({
      data: {
        code: 'MAT-GAL001-A',
        assetId: actGalpon.id,
        locationType: 'activo',
        location: 'Sector de Carga — Puerta Norte',
        type: 'polvo_abc',
        capacity: '6kg',
        brand: 'Kidde',
        expirationDate: isoDate(-15),  // venció hace 15 días → vencido
        lastRechargeDate: isoDate(-380),
        observations: 'VENCIDO — programar recarga con urgencia.',
      },
    }),
    // Vigente — Camión
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

  console.log('  ✔ Fire Extinguishers (4) — vigente×2, proximo×1, vencido×1')

  // ── Claims ────────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.claim.create({
      data: {
        claimNumber: 'SIN-2026-00001',
        assetId: actCamion.id,
        policyId: polAuto.id,
        claimType: 'Accidente',
        occurrenceDate: isoDate(-45),
        reportDate: isoDate(-44),
        description: 'Colisión trasera en Ruta Nacional 9. Daños en paragolpes trasero y sistema de escape.',
        insuranceCompany: 'Federación Patronal Seguros',
        status: 'En trámite',
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
                previousStatus: 'Denunciado',
                newStatus: 'En trámite',
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
        policyId: polIncendio.id,
        claimType: 'Granizo',
        occurrenceDate: isoDate(-10),
        reportDate: isoDate(-9),
        description: 'Granizo severo causó daños en capó y sistema de cosecha. Estimación preliminar en proceso.',
        insuranceCompany: 'La Segunda Seguros',
        status: 'Denunciado',
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

  console.log('  ✔ Claims (2) + Events (4)')

  // ── Catálogos dinámicos ────────────────────────────────────────────────────
  console.log('📋 Insertando catálogos...')

  function catalogBatch(category: string, labels: string[]) {
    return prisma.catalogItem.createMany({
      data: labels.map((label, i) => ({ category, label, sortOrder: i })),
    })
  }

  await Promise.all([
    catalogBatch('insurance_company', [
      'La Segunda', 'Sancor Seguros', 'MAPFRE', 'Zurich', 'Allianz',
      'SMG Seguros', 'Seguros Rivadavia', 'Federación Patronal', 'Galeno', 'Meridional',
    ]),
    catalogBatch('asset_fuel_type', ['Diésel', 'Nafta', 'GNC', 'Eléctrico', 'Híbrido']),
    catalogBatch('asset_building_purpose', [
      'Galpón', 'Depósito', 'Vivienda', 'Oficinas', 'Taller',
      'Industrial', 'Producción porcina', 'Producción avícola', 'Otro',
    ]),
    catalogBatch('asset_infrastructure_type', [
      'Silo', 'Tanque de agua', 'Tanque de combustible',
      'Obra civil', 'Alambrado', 'Manga y corral', 'Otro',
    ]),
    catalogBatch('asset_silo_content', [
      'Soja', 'Maíz', 'Trigo', 'Cebada', 'Girasol',
      'Sorgo', 'Maní', 'Vacío / disponible', 'Otro',
    ]),
    catalogBatch('asset_cargo_species', [
      'Porcino', 'Bovino', 'Ovino', 'Caprino', 'Avícola', 'Equino', 'Otro',
    ]),
    catalogBatch('asset_implement_type', [
      'Sembradora', 'Arado', 'Rastra', 'Fertilizadora',
      'Cincel', 'Rolo', 'Acoplado', 'Otro',
    ]),
    catalogBatch('asset_productive_unit', [
      'Agrícola Norte', 'Agrícola Sur', 'Ganadería',
      'Logística', 'Administración', 'Mantenimiento',
    ]),
    catalogBatch('asset_area', [
      'Producción', 'Administración', 'Logística',
      'Comercial', 'Mantenimiento', 'RRHH',
    ]),
    catalogBatch('fire_ext_type', ['Polvo seco ABC', 'CO2', 'Agua', 'Espuma', 'Halón']),
    catalogBatch('fire_ext_capacity', ['1 kg', '2 kg', '4 kg', '6 kg', '10 kg', '25 kg', '50 kg']),
    catalogBatch('task_type', [
      'Solicitar cotización', 'Renovar póliza', 'Enviar documentación',
      'Gestionar siniestro', 'Solicitar endoso', 'Reclamar documentación', 'Revisar vencimiento',
    ]),
    catalogBatch('document_type', ['Factura', 'Nota de Crédito', 'Nota de Débito', 'Endoso']),
    catalogBatch('document_payment_method', [
      'Transferencia bancaria', 'E-Cheq', 'Efectivo', 'Débito automático', 'Otros',
    ]),
    catalogBatch('document_currency', ['ARS', 'USD']),
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

  console.log('✅ Catálogos insertados.')

  console.log('\n🎉 Seed completado exitosamente.')
  console.log('\n📊 Resumen:')
  console.log('   • 3 Aseguradoras  • 3 Centros de Costo  • 4 Tipos de Seguro + 14 Coberturas')
  console.log('   • 4 Activos       • 2 Productores + 3 Tareas')
  console.log('   • 4 Pólizas       • 3 Documentos + 5 Cuotas')
  console.log('   • 4 Matafuegos    • 2 Siniestros + 4 Eventos')
  console.log('   • 17 Categorías de catálogo con sus ítems')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
