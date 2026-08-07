import { prisma } from '../../config/database'
import { classifyAuditableAssetCategory } from '../asset-audits/asset-audit-category-classification'
import type { AuditableAssetCategory } from '../../shared/types'

interface CategoryAcc {
  total: number
  audited: number
  // Cuántas de las auditadas este período cumplieron cada ítem del checklist
  // — a diferencia de Auditoría de Activos (una condición general BUENO/
  // REGULAR/MALO), acá cada ítem es un booleano independiente.
  policyActiveConfirmed: number
  insuranceCardPresent: number
  dataMatchesInsuredAsset: number
  physicalConditionOk: number
}

function emptyCategoryAcc(): CategoryAcc {
  return { total: 0, audited: 0, policyActiveConfirmed: 0, insuranceCardPresent: 0, dataMatchesInsuredAsset: 0, physicalConditionOk: 0 }
}

export const insuranceAuditDashboardService = {
  // Dashboard de cobertura por categoría — igual que Auditoría de Activos, sin
  // un puntaje 0-100 por punto de control (checklist deliberadamente
  // mínimo). Reporta cobertura y, de lo auditado, cuántos cumplieron cada
  // ítem de documentación/condición.
  async getAuditDashboard(period: string) {
    const [assets, audits] = await Promise.all([
      prisma.asset.findMany({
        where: { isActive: true, auditable: true },
        select: { id: true, assetType: true },
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period, status: { not: 'REJECTED' } },
        select: {
          assetId: true,
          policyActiveConfirmed: true,
          insuranceCardPresent: true,
          dataMatchesInsuredAsset: true,
          physicalConditionOk: true,
          auditDate: true,
        },
        orderBy: { auditDate: 'desc' },
      }),
    ])

    const latestAuditByAsset = new Map<string, (typeof audits)[number]>()
    for (const a of audits) {
      if (!latestAuditByAsset.has(a.assetId)) latestAuditByAsset.set(a.assetId, a)
    }

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
      if (audit.policyActiveConfirmed) acc.policyActiveConfirmed += 1
      if (audit.insuranceCardPresent) acc.insuranceCardPresent += 1
      if (audit.dataMatchesInsuredAsset) acc.dataMatchesInsuredAsset += 1
      if (audit.physicalConditionOk) acc.physicalConditionOk += 1
    }

    const categories = [...byCategory.entries()]
      .map(([category, acc]) => ({
        category,
        total: acc.total,
        audited: acc.audited,
        pending: acc.total - acc.audited,
        percentAudited: acc.total > 0 ? Math.round((acc.audited / acc.total) * 100) : null,
        checklistCompliance: {
          policyActiveConfirmed: acc.policyActiveConfirmed,
          insuranceCardPresent: acc.insuranceCardPresent,
          dataMatchesInsuredAsset: acc.dataMatchesInsuredAsset,
          physicalConditionOk: acc.physicalConditionOk,
        },
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

  // Progreso por auditor — mismo patrón que asset-audit-dashboard.service.ts,
  // alcance por categoría (UserAuditScope, área INSURANCE_AUDIT).
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
        where: { isActive: true, auditable: true },
        select: { id: true, assetType: true },
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period, status: { not: 'REJECTED' } },
        select: { assetId: true, auditedBy: true, auditDate: true },
        orderBy: { auditDate: 'desc' },
      }),
    ])

    const eligible = assets
      .map((a) => ({ id: a.id, category: classifyAuditableAssetCategory(a.assetType) }))
      .filter((a): a is { id: string; category: AuditableAssetCategory } => a.category !== null)

    const latestAuditByAsset = new Map<string, string>() // assetId -> auditedBy
    for (const a of auditRows) {
      if (!latestAuditByAsset.has(a.assetId)) latestAuditByAsset.set(a.assetId, a.auditedBy)
    }

    return {
      period,
      auditors: auditors.map((u) => {
        const scope = new Set(u.auditScopes.map((s) => s.scopeValue))
        const assignedAssets = eligible.filter((a) => scope.has(a.category))
        const completed = assignedAssets.filter((a) => latestAuditByAsset.get(a.id) === u.email).length
        const assigned = assignedAssets.length
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          assignedCategories: [...scope].sort((a, b) => a.localeCompare(b)),
          assigned,
          completed,
          pending: assigned - completed,
          completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : null,
        }
      }),
    }
  },
}
