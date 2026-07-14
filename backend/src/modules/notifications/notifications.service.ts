import { prisma } from '../../config/database'
import { toDateStr, dateOffset, todayDate, computeExpirationStatus, computePolicyStatus } from '../../shared/utils/dates'
import {
  buildFireExtinguisherAtRiskFilter,
  computeFireExtinguisherStatus,
} from '../fire-extinguishers/fire-extinguishers.expiration'

export type NotificationSeverity = 'vencido' | 'proximo_vencer'

export type NotificationCategory =
  | 'policy'
  | 'fire_extinguisher'
  | 'installment_overdue'
  | 'installment_near'
  | 'asset_attachment'
  | 'policy_attachment'

export interface NotificationItem {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  subtitle: string | null
  dueDate: string
  entityType: 'Policy' | 'FireExtinguisher' | 'AccountingDocument' | 'Asset'
  entityId: string
}

// ── Notification service ──────────────────────────────────────────────────────

export const notificationsService = {
  async previewExpirations() {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    const [
      expiringPolicies,
      expiringExtinguishers,
      overdueInstallments,
      nearInstallments,
      expiringAssetAttachments,
      expiringPolicyAttachments,
    ] = await Promise.all([
      prisma.policy.count({
        where: { isActive: true, endDate: { gte: today, lte: in30Days } },
      }),
      prisma.fireExtinguisher.count({
        where: { isActive: true, ...buildFireExtinguisherAtRiskFilter(30) },
      }),
      prisma.documentInstallment.count({
        where: { paymentStatus: { not: 'PAID' }, dueDate: { lt: today } },
      }),
      prisma.documentInstallment.count({
        where: { paymentStatus: { not: 'PAID' }, dueDate: { gte: today, lte: in7Days } },
      }),
      prisma.assetAttachment.count({
        where: { expirationDate: { lte: in30Days } },
      }),
      prisma.policyAttachment.count({
        where: { expirationDate: { lte: in30Days } },
      }),
    ])

    const expiringAttachments = expiringAssetAttachments + expiringPolicyAttachments

    return {
      expiringPolicies,
      expiringExtinguishers,
      overdueInstallments,
      nearInstallments,
      expiringAttachments,
      hasAlerts:
        expiringPolicies + expiringExtinguishers + overdueInstallments + nearInstallments + expiringAttachments > 0,
    }
  },

  // Lista itemizada para el centro de notificaciones — todo calculado en vivo
  // sobre las tablas reales, sin persistir nada (mismo criterio que ya usaba
  // previewExpirations, solo que acá se devuelve el detalle en vez del conteo).
  async listNotifications(): Promise<NotificationItem[]> {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    // Techo por categoría — esto es un centro de alertas de "próximos
    // vencimientos", no un listado de trabajo paginado. Sin este `take`, cada
    // findMany crece sin límite junto con el negocio (más pólizas, más cuotas,
    // más adjuntos vencen en la ventana de 30 días).
    const ITEM_CAP = 200

    const [policies, extinguishers, overdueInstallments, nearInstallments, assetAttachments, policyAttachments] =
      await Promise.all([
        prisma.policy.findMany({
          where: { isActive: true, endDate: { gte: today, lte: in30Days } },
          include: { company: { select: { name: true } } },
          orderBy: { endDate: 'asc' },
          take: ITEM_CAP,
        }),
        prisma.fireExtinguisher.findMany({
          where: { isActive: true, ...buildFireExtinguisherAtRiskFilter(30) },
          orderBy: { expirationDate: 'asc' },
          take: ITEM_CAP,
        }),
        prisma.documentInstallment.findMany({
          where: { paymentStatus: { not: 'PAID' }, dueDate: { lt: today } },
          include: { document: { select: { id: true, documentNumber: true, insuranceCompany: true } } },
          orderBy: { dueDate: 'asc' },
          take: ITEM_CAP,
        }),
        prisma.documentInstallment.findMany({
          where: { paymentStatus: { not: 'PAID' }, dueDate: { gte: today, lte: in7Days } },
          include: { document: { select: { id: true, documentNumber: true, insuranceCompany: true } } },
          orderBy: { dueDate: 'asc' },
          take: ITEM_CAP,
        }),
        prisma.assetAttachment.findMany({
          where: { expirationDate: { lte: in30Days } },
          include: { asset: { select: { id: true, name: true } } },
          orderBy: { expirationDate: 'asc' },
          take: ITEM_CAP,
        }),
        prisma.policyAttachment.findMany({
          where: { expirationDate: { lte: in30Days } },
          include: { policy: { select: { id: true, policyNumber: true } } },
          orderBy: { expirationDate: 'asc' },
          take: ITEM_CAP,
        }),
      ])

    const items: NotificationItem[] = [
      ...policies.map((p): NotificationItem => ({
        id: `policy:${p.id}`,
        category: 'policy',
        severity: computePolicyStatus(p.endDate) === 'vencida' ? 'vencido' : 'proximo_vencer',
        title: `${p.policyNumber} — ${p.insuredName}`,
        subtitle: p.company.name,
        dueDate: toDateStr(p.endDate),
        entityType: 'Policy',
        entityId: p.id,
      })),
      ...extinguishers.map((e): NotificationItem => ({
        id: `fire_extinguisher:${e.id}`,
        category: 'fire_extinguisher',
        severity:
          computeFireExtinguisherStatus(e.expirationDate, e.manufacturingYear, e.hydraulicTestExpirationDate) === 'vencido'
            ? 'vencido'
            : 'proximo_vencer',
        title: e.code ?? e.id.substring(0, 8),
        subtitle: e.location ?? e.locationType,
        dueDate: toDateStr(e.expirationDate),
        entityType: 'FireExtinguisher',
        entityId: e.id,
      })),
      ...overdueInstallments.map((i): NotificationItem => ({
        id: `installment_overdue:${i.id}`,
        category: 'installment_overdue',
        severity: 'vencido',
        title: `Cuota #${i.installmentNumber} — ${i.document.documentNumber}`,
        subtitle: i.document.insuranceCompany,
        dueDate: toDateStr(i.dueDate),
        entityType: 'AccountingDocument',
        entityId: i.document.id,
      })),
      ...nearInstallments.map((i): NotificationItem => ({
        id: `installment_near:${i.id}`,
        category: 'installment_near',
        severity: 'proximo_vencer',
        title: `Cuota #${i.installmentNumber} — ${i.document.documentNumber}`,
        subtitle: i.document.insuranceCompany,
        dueDate: toDateStr(i.dueDate),
        entityType: 'AccountingDocument',
        entityId: i.document.id,
      })),
      ...assetAttachments.map((a): NotificationItem => ({
        id: `asset_attachment:${a.id}`,
        category: 'asset_attachment',
        severity: computeExpirationStatus(a.expirationDate!) === 'vencido' ? 'vencido' : 'proximo_vencer',
        title: a.name,
        subtitle: `Activo: ${a.asset.name}`,
        dueDate: toDateStr(a.expirationDate),
        entityType: 'Asset',
        entityId: a.asset.id,
      })),
      ...policyAttachments.map((a): NotificationItem => ({
        id: `policy_attachment:${a.id}`,
        category: 'policy_attachment',
        severity: computeExpirationStatus(a.expirationDate!) === 'vencido' ? 'vencido' : 'proximo_vencer',
        title: a.name,
        subtitle: `Póliza: ${a.policy.policyNumber}`,
        dueDate: toDateStr(a.expirationDate),
        entityType: 'Policy',
        entityId: a.policy.id,
      })),
    ]

    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  },
}
