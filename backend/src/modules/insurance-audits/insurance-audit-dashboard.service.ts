import { prisma } from '../../config/database'
import { latestByKey } from '../../shared/utils/latest-by-key'
import { classifyAuditableAssetCategory } from '../asset-audits/asset-audit-category-classification'
import type { AuditableAssetCategory } from '../../shared/types'

interface CategoryAcc {
  total: number
  audited: number
  withCirculationCard: number
}

function emptyCategoryAcc(): CategoryAcc {
  return { total: 0, audited: 0, withCirculationCard: 0 }
}

export const insuranceAuditDashboardService = {
  // Dashboard de cobertura por categoría — igual que Auditoría de Activos, sin
  // un puntaje 0-100 por punto de control (checklist deliberadamente
  // mínimo: solo "¿tiene la tarjeta de circulación a bordo?"). Reporta
  // cobertura y, de lo auditado, cuántos activos tienen la tarjeta.
  async getAuditDashboard(period: string) {
    const [assets, audits] = await Promise.all([
      prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, assetType: true },
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period },
        select: { assetId: true, hasCirculationCard: true, auditDate: true },
        // Más reciente por createdAt, no por auditDate — ver latest-by-key.ts.
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const latestAuditByAsset = latestByKey(audits, (a) => a.assetId)

    const byCategory = new Map<string, CategoryAcc>()
    let totalRegistered = 0
    let totalAudited = 0

    for (const asset of assets) {
      const category = classifyAuditableAssetCategory(asset.assetType)
      if (!category) continue

      totalRegistered += 1
      if (!byCategory.has(category)) byCategory.set(category, emptyCategoryAcc())
      const acc = byCategory.get(category)!
      acc.total += 1

      const audit = latestAuditByAsset.get(asset.id)
      if (!audit) continue

      totalAudited += 1
      acc.audited += 1
      if (audit.hasCirculationCard) acc.withCirculationCard += 1
    }

    const categories = [...byCategory.entries()]
      .map(([category, acc]) => ({
        category,
        total: acc.total,
        audited: acc.audited,
        pending: acc.total - acc.audited,
        percentAudited: acc.total > 0 ? Math.round((acc.audited / acc.total) * 100) : null,
        withCirculationCard: acc.withCirculationCard,
        withoutCirculationCard: acc.audited - acc.withCirculationCard,
      }))
      .sort((a, b) => a.category.localeCompare(b.category))

    return {
      period,
      totalRegistered,
      totalAudited,
      totalPending: totalRegistered - totalAudited,
      percentAudited: totalRegistered > 0 ? Math.round((totalAudited / totalRegistered) * 100) : null,
      categories,
    }
  },

  // Progreso por auditor — alcance por activo individual (UserAuditScope,
  // área INSURANCE_AUDIT, scopeValue = assetId — ver asset-audits-assignments.service.ts).
  async getAuditorProgress(period: string) {
    const [auditors, assets, auditRows] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, accessProfile: { modules: { has: 'insurance_audit_coverage' } } },
        select: {
          id: true,
          name: true,
          email: true,
          auditScopes: { where: { area: 'INSURANCE_AUDIT' }, select: { scopeValue: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, assetType: true },
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period },
        select: { assetId: true, auditedBy: true, auditDate: true },
        // Más reciente por createdAt, no por auditDate — ver latest-by-key.ts.
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const eligible = assets
      .map((a) => ({ id: a.id, category: classifyAuditableAssetCategory(a.assetType) }))
      .filter((a): a is { id: string; category: AuditableAssetCategory } => a.category !== null)

    const latestAuditByAsset = latestByKey(auditRows, (a) => a.assetId) // assetId -> última fila

    return {
      period,
      auditors: auditors.map((u) => {
        const scope = new Set(u.auditScopes.map((s) => s.scopeValue))
        const assignedAssets = eligible.filter((a) => scope.has(a.id))
        const completed = assignedAssets.filter((a) => latestAuditByAsset.get(a.id)?.auditedBy === u.email).length
        const assigned = assignedAssets.length
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          assignedAssetIds: [...scope].sort((a, b) => a.localeCompare(b)),
          assigned,
          completed,
          pending: assigned - completed,
          completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : null,
        }
      }),
    }
  },
}
