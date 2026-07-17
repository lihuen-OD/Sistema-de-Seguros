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
  reviewed: boolean
}

// ── Notification service ──────────────────────────────────────────────────────

export const notificationsService = {
  // previewExpirations (campanita) reusa listNotifications (página completa)
  // en vez de recalcular las mismas 6 queries por separado — así el filtro
  // de "revisado" se implementa una sola vez y ambos quedan consistentes
  // entre sí por construcción, no por disciplina de mantenerlos sincronizados.
  async previewExpirations(userId: string) {
    const items = await this.listNotifications(userId)
    const pending = items.filter((i) => !i.reviewed)

    const countBy = (category: NotificationCategory) => pending.filter((i) => i.category === category).length

    const expiringPolicies = countBy('policy')
    const expiringExtinguishers = countBy('fire_extinguisher')
    const overdueInstallments = countBy('installment_overdue')
    const nearInstallments = countBy('installment_near')
    const expiringAttachments = countBy('asset_attachment') + countBy('policy_attachment')

    return {
      expiringPolicies,
      expiringExtinguishers,
      overdueInstallments,
      nearInstallments,
      expiringAttachments,
      hasAlerts: pending.length > 0,
    }
  },

  // Lista itemizada para el centro de notificaciones — todo calculado en vivo
  // sobre las tablas reales, sin persistir nada salvo qué ítems ya revisó
  // cada usuario (mismo criterio que ya usaba previewExpirations, solo que
  // acá se devuelve el detalle en vez del conteo).
  async listNotifications(userId: string): Promise<NotificationItem[]> {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    // Techo por categoría — esto es un centro de alertas de "próximos
    // vencimientos", no un listado de trabajo paginado. Sin este `take`, cada
    // findMany crece sin límite junto con el negocio (más pólizas, más cuotas,
    // más adjuntos vencen en la ventana de 30 días).
    const ITEM_CAP = 200

    const [policies, extinguishers, overdueInstallments, nearInstallments, assetAttachments, policyAttachments, dismissals] =
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
        prisma.notificationDismissal.findMany({
          where: { userId },
          select: { notificationId: true, dueDate: true },
        }),
      ])

    const dismissedKeys = new Set(dismissals.map((d) => `${d.notificationId}:${d.dueDate}`))
    const isReviewed = (id: string, dueDate: string) => dismissedKeys.has(`${id}:${dueDate}`)

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
        reviewed: isReviewed(`policy:${p.id}`, toDateStr(p.endDate)),
      })),
      ...extinguishers.map((e): NotificationItem => ({
        id: `fire_extinguisher:${e.id}`,
        category: 'fire_extinguisher',
        severity:
          computeFireExtinguisherStatus(e.expirationDate, e.manufacturingYear, e.hydraulicTestExpirationDate) === 'vencido'
            ? 'vencido'
            : 'proximo_vencer',
        title: e.code ?? e.id.substring(0, 8),
        subtitle: [e.establishment, e.locationType, e.location].filter(Boolean).join(' · '),
        dueDate: toDateStr(e.expirationDate),
        entityType: 'FireExtinguisher',
        entityId: e.id,
        reviewed: isReviewed(`fire_extinguisher:${e.id}`, toDateStr(e.expirationDate)),
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
        reviewed: isReviewed(`installment_overdue:${i.id}`, toDateStr(i.dueDate)),
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
        reviewed: isReviewed(`installment_near:${i.id}`, toDateStr(i.dueDate)),
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
        reviewed: isReviewed(`asset_attachment:${a.id}`, toDateStr(a.expirationDate)),
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
        reviewed: isReviewed(`policy_attachment:${a.id}`, toDateStr(a.expirationDate)),
      })),
    ]

    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  },

  // Sirve tanto para marcar una sola fila (array de 1) como para el botón
  // masivo de "vencidas" (array de N) — skipDuplicates lo hace idempotente,
  // así que no hace falta chequear antes si ya estaba marcada.
  async review(userId: string, items: { notificationId: string; dueDate: string }[]) {
    await prisma.notificationDismissal.createMany({
      data: items.map((i) => ({ userId, notificationId: i.notificationId, dueDate: i.dueDate })),
      skipDuplicates: true,
    })
    return { message: 'Marcado como revisado' }
  },

  async unreview(userId: string, items: { notificationId: string; dueDate: string }[]) {
    await prisma.notificationDismissal.deleteMany({
      where: {
        userId,
        OR: items.map((i) => ({ notificationId: i.notificationId, dueDate: i.dueDate })),
      },
    })
    return { message: 'Marcado como no revisado' }
  },
}
