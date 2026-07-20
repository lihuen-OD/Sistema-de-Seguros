import { prisma } from '../../config/database'
import { toDateStr, dateOffset, todayDate } from '../../shared/utils/dates'
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
      claimTotal,
      claimOpen,
      overdueTasks,
      companiesActive,
    ] = await Promise.all([
      prisma.asset.count({ where: { isActive: true } }),
      prisma.asset.aggregate({ _sum: { currentValue: true }, where: { isActive: true } }),
      prisma.policy.count({ where: { isActive: true, endDate: { gt: in30Days } } }),
      prisma.policy.count({
        where: { isActive: true, endDate: { gte: today, lte: in30Days } },
      }),
      prisma.policy.count({ where: { isActive: true, endDate: { lt: today } } }),
      prisma.policy.aggregate({
        _sum: { premium: true },
        where: { isActive: true, endDate: { gte: today } },
      }),
      prisma.accountingDocument.aggregate({
        _sum: { netAmount: true, vatAmount: true, otherTaxesAmount: true },
        _count: { id: true },
        where: { paymentStatus: { not: 'PAID' } },
      }),
      prisma.documentInstallment.aggregate({
        _sum: { amount: true },
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
      prisma.claim.count({ where: { isActive: true } }),
      prisma.claim.count({
        where: { isActive: true, status: { in: ['denunciado', 'en_tramite'] } },
      }),
      prisma.producerTask.count({
        where: { dueDate: { lt: today }, status: { notIn: ['finalizada'] } },
      }),
      prisma.company.count({ where: { isActive: true } }),
    ])

    const pendingDocAmount =
      (docPendingRaw._sum.netAmount ?? 0) +
      (docPendingRaw._sum.vatAmount ?? 0) +
      (docPendingRaw._sum.otherTaxesAmount ?? 0)
    const pendingInstallmentsAmount = installmentPendingRaw._sum.amount ?? 0

    return {
      assets: {
        total: totalAssets,
        currentValue: assetValueAgg._sum.currentValue ?? 0,
      },
      policies: {
        total: policiesVigente + policiesProxima + policiesVencida,
        vigente: policiesVigente,
        proxima_a_vencer: policiesProxima,
        vencida: policiesVencida,
        premiumVigente: premiumAgg._sum.premium ?? 0,
      },
      documents: {
        pendingCount: docPendingRaw._count.id,
        pendingAmount: pendingDocAmount,
        pendingInstallmentsCount: installmentPendingRaw._count.id,
        pendingInstallmentsAmount,
      },
      extinguishers: {
        total: extTotal,
        vigente: extTotal - extVencido - extProximo,
        proximo_vencer: extProximo,
        vencido: extVencido,
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
        company: { select: { id: true, name: true } },
        insuranceType: { select: { id: true, name: true } },
      },
    })

    return policies.map((p) => ({
      id: p.id,
      policyNumber: p.policyNumber,
      insuredName: p.insuredName,
      endDate: toDateStr(p.endDate),
      premium: p.premium,
      currency: p.currency,
      company: p.company,
      insuranceType: p.insuranceType,
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

    const [installments, premiumByCompanyRaw, allCompanyNames, extTotal, extVencido, extProximo, policiesVigente, policiesProxima, policiesVencida] =
      await Promise.all([
        prisma.documentInstallment.findMany({
          where: { dueDate: { gte: yearStart, lte: yearEnd } },
          select: { dueDate: true, amount: true },
        }),
        prisma.policy.groupBy({
          by: ['companyId'],
          _sum: { premium: true },
          where: { isActive: true },
        }),
        prisma.company.findMany({ select: { id: true, name: true } }),
        prisma.fireExtinguisher.count({ where: { isActive: true } }),
        prisma.fireExtinguisher.count({
          where: { isActive: true, ...buildFireExtinguisherStatusFilter('vencido') },
        }),
        prisma.fireExtinguisher.count({
          where: { isActive: true, ...buildFireExtinguisherStatusFilter('proximo_vencer') },
        }),
        prisma.policy.count({ where: { isActive: true, endDate: { gt: in30Days } } }),
        prisma.policy.count({ where: { isActive: true, endDate: { gte: today, lte: in30Days } } }),
        prisma.policy.count({ where: { isActive: true, endDate: { lt: today } } }),
      ])

    // Monthly cost evolution (12 months of the requested year)
    const monthlyMap = new Map<string, number>()
    for (const inst of installments) {
      const month = toDateStr(inst.dueDate).substring(0, 7)
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + inst.amount)
    }
    const costEvolution = Array.from({ length: 12 }, (_, i) => {
      const month = `${y}-${String(i + 1).padStart(2, '0')}`
      return { month, amount: monthlyMap.get(month) ?? 0 }
    })

    // Top 5 companies by total premium (via SQL groupBy — no in-memory aggregation)
    const companyNameMap = new Map(allCompanyNames.map((c) => [c.id, c.name]))
    const premiumByCompany = premiumByCompanyRaw
      .map((row) => ({ name: companyNameMap.get(row.companyId) ?? row.companyId, total: row._sum.premium ?? 0 }))
      .sort((a, b) => b.total - a.total)
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
        vigente: extTotal - extVencido - extProximo,
        proximo_vencer: extProximo,
        vencido: extVencido,
      },
    }
  },
}
