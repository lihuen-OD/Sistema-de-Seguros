import { prisma } from '../../config/database'
import { toDateStr, dateOffset, todayDate, computeExpirationStatus, computePolicyStatus } from '../../shared/utils/dates'
import {
  buildFireExtinguisherAtRiskFilter,
  computeFireExtinguisherStatus,
} from '../fire-extinguishers/fire-extinguishers.expiration'
import type { ModuleKey, RequestUser } from '../../shared/types'

export type NotificationSeverity = 'vencido' | 'proximo_vencer'

export type NotificationCategory =
  | 'policy'
  | 'fire_extinguisher'
  | 'installment_overdue'
  | 'installment_near'
  | 'asset_attachment'

// A qué módulo pertenece cada categoría — un usuario sin ADMIN solo ve las
// notificaciones de los módulos que ya tiene habilitados.
const CATEGORY_MODULE: Record<NotificationCategory, ModuleKey> = {
  policy: 'policies',
  fire_extinguisher: 'fire_extinguishers',
  installment_overdue: 'documents',
  installment_near: 'documents',
  asset_attachment: 'assets',
}

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
  async previewExpirations(user: RequestUser) {
    const items = await this.listNotifications(user)
    const pending = items.filter((i) => !i.reviewed)

    const countBy = (category: NotificationCategory) => pending.filter((i) => i.category === category).length

    const expiringPolicies = countBy('policy')
    const expiringExtinguishers = countBy('fire_extinguisher')
    const overdueInstallments = countBy('installment_overdue')
    const nearInstallments = countBy('installment_near')
    const expiringAttachments = countBy('asset_attachment')

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
  // sobre las tablas reales, sin persistir nada salvo qué ítems ya se
  // revisaron. "Revisado" es un estado COMPARTIDO (no por usuario) — lo
  // gestiona el ADMIN y se ve igual para todos (ver notifications.router.ts).
  async listNotifications(user: RequestUser): Promise<NotificationItem[]> {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    // Techo por categoría — esto es un centro de alertas de "próximos
    // vencimientos", no un listado de trabajo paginado. Sin este `take`, cada
    // findMany crece sin límite junto con el negocio (más pólizas, más cuotas,
    // más adjuntos vencen en la ventana de 30 días).
    const ITEM_CAP = 200

    const [policies, extinguishers, overdueInstallments, nearInstallments, assetAttachments, dismissals] =
      await Promise.all([
        prisma.policy.findMany({
          where: { isActive: true, endDate: { gte: today, lte: in30Days } },
          // La empresa ya no es un campo único de la póliza — se resuelve por
          // línea (companyId directo en las "sin activo", o la empresa
          // principal del activo en las que sí tienen uno).
          include: {
            coverages: {
              select: {
                company: { select: { name: true } },
                asset: {
                  select: {
                    allocations: {
                      orderBy: { percentage: 'desc' },
                      take: 1,
                      select: { company: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
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
        // Sin `where: { userId }` a propósito — "revisado" es compartido: si
        // CUALQUIERA (en la práctica, solo un ADMIN puede llegar a crear esta
        // fila) ya lo marcó, desaparece para todos.
        prisma.notificationDismissal.findMany({
          select: { notificationId: true, dueDate: true },
        }),
      ])

    const dismissedKeys = new Set(dismissals.map((d) => `${d.notificationId}:${d.dueDate}`))
    const isReviewed = (id: string, dueDate: string) => dismissedKeys.has(`${id}:${dueDate}`)

    const items: NotificationItem[] = [
      ...policies.map((p): NotificationItem => {
        const companyNames = [...new Set(
          p.coverages
            .map((c) => c.company?.name ?? c.asset?.allocations[0]?.company?.name)
            .filter((name): name is string => !!name),
        )]
        return {
          id: `policy:${p.id}`,
          category: 'policy',
          severity: computePolicyStatus(p.endDate) === 'vencida' ? 'vencido' : 'proximo_vencer',
          title: `${p.policyNumber} — ${p.insuredName}`,
          subtitle: companyNames.join(', '),
          dueDate: toDateStr(p.endDate),
          entityType: 'Policy',
          entityId: p.id,
          reviewed: isReviewed(`policy:${p.id}`, toDateStr(p.endDate)),
        }
      }),
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
    ]

    // ADMIN ve todo — el resto solo ve categorías de módulos que ya tiene
    // habilitados (mismo criterio OR que requireModule en el resto de la API).
    const visible = user.role === 'ADMIN'
      ? items
      : items.filter((i) => user.modules.includes(CATEGORY_MODULE[i.category]))

    return visible.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
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

  // Sin scope por userId a propósito — "revisado" es compartido, así que
  // desmarcar borra la(s) fila(s) de quien sea que lo haya revisado antes,
  // no solo las del ADMIN que ejecuta esta acción.
  async unreview(items: { notificationId: string; dueDate: string }[]) {
    await prisma.notificationDismissal.deleteMany({
      where: {
        OR: items.map((i) => ({ notificationId: i.notificationId, dueDate: i.dueDate })),
      },
    })
    return { message: 'Marcado como no revisado' }
  },
}
