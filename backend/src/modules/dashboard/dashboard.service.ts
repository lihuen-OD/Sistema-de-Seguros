import { prisma } from '../../config/database'
import { toDateStr, dateOffset, todayDate, buildPolicyStatusFilter } from '../../shared/utils/dates'
import { buildFireExtinguisherStatusFilter } from '../fire-extinguishers/fire-extinguishers.expiration'

export const dashboardService = {
  // ── KPIs ──────────────────────────────────────────────────────────────────────

  async getKpis() {
    const today = todayDate()
    const in30Days = dateOffset(30)

    const [
      totalAssets,
      assetValueAgg,
      policiesVigente,
      policiesProxima,
      policiesVencida,
      premiumAgg,
      docPendingRaw,
      installmentPendingRaw,
      extTotal,
      extVencido,
      extProximo,
      extSinFecha,
      claimTotal,
      claimOpen,
      overdueTasks,
      companiesActive,
    ] = await Promise.all([
      prisma.asset.count({ where: { isActive: true } }),
      prisma.asset.aggregate({
        _sum: { currentValueArs: true, currentValueUsd: true },
        where: { isActive: true },
      }),
      prisma.policy.count({ where: { isActive: true, ...buildPolicyStatusFilter('vigente') } }),
      prisma.policy.count({
        where: { isActive: true, ...buildPolicyStatusFilter('proxima_a_vencer') },
      }),
      prisma.policy.count({ where: { isActive: true, ...buildPolicyStatusFilter('vencida') } }),
      prisma.policyAssetCoverage.aggregate({
        _sum: { insuredAmountArs: true, insuredAmountUsd: true },
        where: { policy: { isActive: true, endDate: { gte: today } } },
      }),
      // totalAmountArs/Usd ya son el cierre de (netAmount+vatAmount+otherTaxesAmount) en
      // ambas monedas (ver computeDualAmounts) — no hace falta sumar los 3 componentes
      // por separado como antes.
      prisma.accountingDocument.aggregate({
        _sum: { totalAmountArs: true, totalAmountUsd: true },
        _count: { id: true },
        where: { paymentStatus: { not: 'PAID' } },
      }),
      prisma.documentInstallment.aggregate({
        _sum: { amountArs: true, amountUsd: true },
        _count: { id: true },
        where: { paymentStatus: { not: 'PAID' } },
      }),
      prisma.fireExtinguisher.count({ where: { isActive: true } }),
      prisma.fireExtinguisher.count({
        where: { isActive: true, ...buildFireExtinguisherStatusFilter('vencido') },
      }),
      prisma.fireExtinguisher.count({
        where: { isActive: true, ...buildFireExtinguisherStatusFilter('proximo_vencer') },
      }),
      prisma.fireExtinguisher.count({
        where: { isActive: true, ...buildFireExtinguisherStatusFilter('sin_fecha') },
      }),
      prisma.claim.count({ where: { isActive: true } }),
      prisma.claim.count({
        where: { isActive: true, status: { in: ['denunciado', 'en_tramite'] } },
      }),
      prisma.producerTask.count({
        where: { dueDate: { lt: today }, status: { notIn: ['finalizada'] } },
      }),
      prisma.company.count({ where: { isActive: true } }),
    ])

    return {
      assets: {
        total: totalAssets,
        currentValueArs: assetValueAgg._sum.currentValueArs ?? 0,
        currentValueUsd: assetValueAgg._sum.currentValueUsd ?? 0,
      },
      policies: {
        total: policiesVigente + policiesProxima + policiesVencida,
        vigente: policiesVigente,
        proxima_a_vencer: policiesProxima,
        vencida: policiesVencida,
        premiumVigenteArs: premiumAgg._sum.insuredAmountArs ?? 0,
        premiumVigenteUsd: premiumAgg._sum.insuredAmountUsd ?? 0,
      },
      documents: {
        pendingCount: docPendingRaw._count.id,
        pendingAmountArs: docPendingRaw._sum.totalAmountArs ?? 0,
        pendingAmountUsd: docPendingRaw._sum.totalAmountUsd ?? 0,
        pendingInstallmentsCount: installmentPendingRaw._count.id,
        pendingInstallmentsAmountArs: installmentPendingRaw._sum.amountArs ?? 0,
        pendingInstallmentsAmountUsd: installmentPendingRaw._sum.amountUsd ?? 0,
      },
      extinguishers: {
        total: extTotal,
        vigente: extTotal - extVencido - extProximo - extSinFecha,
        proximo_vencer: extProximo,
        vencido: extVencido,
        sin_fecha: extSinFecha,
      },
      claims: {
        total: claimTotal,
        open: claimOpen,
      },
      tasks: {
        overdue: overdueTasks,
      },
      companies: {
        active: companiesActive,
      },
    }
  },

  // ── Expiring tables ───────────────────────────────────────────────────────────

  async getExpiringPolicies(days = 90) {
    const today = todayDate()
    const limit = dateOffset(days)

    const policies = await prisma.policy.findMany({
      where: { isActive: true, endDate: { gte: today, lte: limit } },
      orderBy: { endDate: 'asc' },
      take: 50,
      include: {
        coverages: {
          select: {
            insuredAmountArs: true,
            insuredAmountUsd: true,
            insuranceType: { select: { id: true, name: true } },
          },
        },
      },
    })

    // El tipo de seguro y la suma asegurada ahora viven por línea de
    // cobertura, no por póliza — se agregan acá (una póliza puede cubrir
    // varios activos, cada uno con su propio tipo/monto).
    return policies.map((p) => ({
      id: p.id,
      policyNumber: p.policyNumber,
      insuredName: p.insuredName,
      endDate: toDateStr(p.endDate),
      totalInsuredAmountArs: p.coverages.reduce((s, c) => s + (c.insuredAmountArs ?? 0), 0),
      totalInsuredAmountUsd: p.coverages.reduce((s, c) => s + (c.insuredAmountUsd ?? 0), 0),
      insuranceTypeNames: [...new Set(p.coverages.map((c) => c.insuranceType.name))],
    }))
  },

  async getExpiringInstallments(days = 60) {
    const today = todayDate()
    const limit = dateOffset(days)

    const installments = await prisma.documentInstallment.findMany({
      where: {
        paymentStatus: { not: 'PAID' },
        dueDate: { gte: today, lte: limit },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
      include: {
        document: {
          select: {
            id: true,
            documentNumber: true,
            documentType: true,
            insuranceCompany: true,
          },
        },
      },
    })

    return installments.map((i) => ({
      id: i.id,
      installmentNumber: i.installmentNumber,
      dueDate: toDateStr(i.dueDate),
      amount: i.amount,
      currency: i.currency,
      paymentStatus: i.paymentStatus,
      document: i.document,
    }))
  },

  // ── Chart data ────────────────────────────────────────────────────────────────

  async getCharts(year?: number) {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const targetYear = year ?? new Date().getFullYear()
    const y = String(targetYear)
    const yearStart = new Date(`${y}-01-01T00:00:00.000Z`)
    const yearEnd = new Date(`${y}-12-31T00:00:00.000Z`)

    const [
      installments,
      premiumByCompanyRaw,
      allCompanyNames,
      extTotal,
      extVencido,
      extProximo,
      extSinFecha,
      policiesVigente,
      policiesProxima,
      policiesVencida,
    ] = await Promise.all([
        prisma.documentInstallment.findMany({
          where: { dueDate: { gte: yearStart, lte: yearEnd } },
          select: { dueDate: true, amountArs: true, amountUsd: true },
        }),
        // La empresa ya no es un campo único de la póliza — se resuelve por
        // línea: companyId directo en las líneas "sin activo", o la empresa
        // principal (mayor %) del activo en las que sí tienen uno.
        prisma.policyAssetCoverage.findMany({
          where: { policy: { isActive: true } },
          select: {
            insuredAmountArs: true,
            insuredAmountUsd: true,
            companyId: true,
            asset: {
              select: {
                allocations: { orderBy: { percentage: 'desc' }, take: 1, select: { companyId: true } },
              },
            },
          },
        }),
        prisma.company.findMany({ select: { id: true, name: true } }),
        prisma.fireExtinguisher.count({ where: { isActive: true } }),
        prisma.fireExtinguisher.count({
          where: { isActive: true, ...buildFireExtinguisherStatusFilter('vencido') },
        }),
        prisma.fireExtinguisher.count({
          where: { isActive: true, ...buildFireExtinguisherStatusFilter('proximo_vencer') },
        }),
        prisma.fireExtinguisher.count({
          where: { isActive: true, ...buildFireExtinguisherStatusFilter('sin_fecha') },
        }),
        prisma.policy.count({ where: { isActive: true, ...buildPolicyStatusFilter('vigente') } }),
        prisma.policy.count({ where: { isActive: true, ...buildPolicyStatusFilter('proxima_a_vencer') } }),
        prisma.policy.count({ where: { isActive: true, ...buildPolicyStatusFilter('vencida') } }),
      ])

    // Monthly cost evolution (12 months of the requested year) — series separadas
    // por moneda, nunca mezcladas (ver amountArs/amountUsd, cerrados al crear/pagar
    // cada cuota).
    const monthlyMapArs = new Map<string, number>()
    const monthlyMapUsd = new Map<string, number>()
    for (const inst of installments) {
      const month = toDateStr(inst.dueDate).substring(0, 7)
      monthlyMapArs.set(month, (monthlyMapArs.get(month) ?? 0) + (inst.amountArs ?? 0))
      monthlyMapUsd.set(month, (monthlyMapUsd.get(month) ?? 0) + (inst.amountUsd ?? 0))
    }
    const costEvolution = Array.from({ length: 12 }, (_, i) => {
      const month = `${y}-${String(i + 1).padStart(2, '0')}`
      return {
        month,
        amountArs: monthlyMapArs.get(month) ?? 0,
        amountUsd: monthlyMapUsd.get(month) ?? 0,
      }
    })

    // Top 5 companies por suma asegurada total — agregación en memoria (ya no
    // es un simple groupBy por columna: la empresa de cada línea puede venir
    // de su propio companyId o de la empresa principal del activo). Se ordena
    // por el total en ARS (siempre poblado, es el denominador común entre
    // pólizas en distintas monedas) pero se muestran ambos montos por empresa.
    const companyNameMap = new Map(allCompanyNames.map((c) => [c.id, c.name]))
    const premiumByCompanyMap = new Map<string, { totalArs: number; totalUsd: number }>()
    for (const coverage of premiumByCompanyRaw) {
      const companyId = coverage.companyId ?? coverage.asset?.allocations[0]?.companyId
      if (!companyId) continue
      const entry = premiumByCompanyMap.get(companyId) ?? { totalArs: 0, totalUsd: 0 }
      entry.totalArs += coverage.insuredAmountArs ?? 0
      entry.totalUsd += coverage.insuredAmountUsd ?? 0
      premiumByCompanyMap.set(companyId, entry)
    }
    const premiumByCompany = [...premiumByCompanyMap.entries()]
      .map(([companyId, totals]) => ({ name: companyNameMap.get(companyId) ?? companyId, ...totals }))
      .sort((a, b) => b.totalArs - a.totalArs)
      .slice(0, 5)

    return {
      costEvolution,
      premiumByCompany,
      policyStatusDistribution: {
        vigente: policiesVigente,
        proxima_a_vencer: policiesProxima,
        vencida: policiesVencida,
      },
      extinguisherStatusDistribution: {
        vigente: extTotal - extVencido - extProximo - extSinFecha,
        proximo_vencer: extProximo,
        vencido: extVencido,
        sin_fecha: extSinFecha,
      },
    }
  },
}
