import { prisma } from '../../config/database'
import { getTransporter, isMailerConfigured } from '../../config/mailer'
import { AppError } from '../../shared/errors/AppError'
import { toISODate, toDateStr, dateOffset, todayDate } from '../../shared/utils/dates'
import {
  buildFireExtinguisherAtRiskFilter,
  computeFireExtinguisherStatus,
} from '../fire-extinguishers/fire-extinguishers.expiration'
import { env } from '../../config/env'

function formatDate(d: Date | string): string {
  const iso = toDateStr(d)
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
}

function formatAmount(amount: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Email HTML builder ────────────────────────────────────────────────────────

function buildEmailHtml(sections: { title: string; color: string; rows: string[][] }[]): string {
  const today = formatDate(toISODate())
  const headerColor = '#1a1a2e'

  const sectionHtml = sections
    .filter((s) => s.rows.length > 0)
    .map(
      (s) => `
      <div style="margin-bottom: 28px;">
        <div style="background:${s.color}; color:#fff; padding: 10px 16px; border-radius: 6px 6px 0 0; font-weight: bold; font-size: 14px;">
          ${s.title} — ${s.rows.length} item${s.rows.length !== 1 ? 's' : ''}
        </div>
        <table style="width:100%; border-collapse: collapse; font-size: 13px;">
          ${s.rows
            .map(
              (row, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
              ${row.map((cell) => `<td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${cell}</td>`).join('')}
            </tr>`,
            )
            .join('')}
        </table>
      </div>`,
    )
    .join('')

  if (!sectionHtml) {
    return `
      <html><body style="font-family: Arial, sans-serif; background:#f5f5f5; padding: 20px;">
        <div style="max-width:700px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1);">
          <div style="background:${headerColor}; color:#fff; padding:24px; text-align:center;">
            <h1 style="margin:0; font-size:22px;">Sistema de Seguros LO</h1>
            <p style="margin:8px 0 0; opacity:.7; font-size:13px;">Reporte de Vencimientos — ${today}</p>
          </div>
          <div style="padding:32px; text-align:center; color:#555;">
            <p style="font-size:16px; color:#22c55e; font-weight:bold;">✓ Sin vencimientos próximos</p>
            <p style="font-size:13px;">No hay pólizas, cuotas ni matafuegos próximos a vencer en los próximos días.</p>
          </div>
        </div>
      </body></html>`
  }

  return `
    <html><body style="font-family: Arial, sans-serif; background:#f5f5f5; padding: 20px;">
      <div style="max-width:700px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1);">
        <div style="background:${headerColor}; color:#fff; padding:24px; text-align:center;">
          <h1 style="margin:0; font-size:22px;">Sistema de Seguros LO</h1>
          <p style="margin:8px 0 0; opacity:.7; font-size:13px;">Reporte de Vencimientos — ${today}</p>
        </div>
        <div style="padding:24px;">
          ${sectionHtml}
        </div>
        <div style="background:#f9fafb; padding:14px; text-align:center; font-size:11px; color:#9ca3af; border-top:1px solid #e5e7eb;">
          Generado automáticamente · Sistema de Seguros LO · ${today}
        </div>
      </div>
    </body></html>`
}

// ── Notification service ──────────────────────────────────────────────────────

export const notificationsService = {
  async checkAndSendExpirationAlerts(toEmail?: string) {
    if (!isMailerConfigured()) {
      throw new AppError(
        503,
        'Servicio de email no configurado. Definí SMTP_HOST, SMTP_USER y SMTP_PASS en .env',
        'SMTP_NOT_CONFIGURED',
      )
    }

    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    const [expiringPolicies, expiringExtinguishers, overdueInstallments, nearInstallments] =
      await Promise.all([
        // Pólizas que vencen en los próximos 30 días
        prisma.policy.findMany({
          where: { isActive: true, endDate: { gte: today, lte: in30Days } },
          orderBy: { endDate: 'asc' },
          include: { company: { select: { name: true } } },
        }),
        // Matafuegos vencidos o que vencen en 30 días (por carga o por vida útil)
        prisma.fireExtinguisher.findMany({
          where: { isActive: true, ...buildFireExtinguisherAtRiskFilter(30) },
          orderBy: { expirationDate: 'asc' },
        }),
        // Cuotas vencidas y sin pagar
        prisma.documentInstallment.findMany({
          where: { paymentStatus: { not: 'PAID' }, dueDate: { lt: today } },
          orderBy: { dueDate: 'asc' },
          include: { document: { select: { documentNumber: true, insuranceCompany: true } } },
        }),
        // Cuotas que vencen en los próximos 7 días
        prisma.documentInstallment.findMany({
          where: { paymentStatus: { not: 'PAID' }, dueDate: { gte: today, lte: in7Days } },
          orderBy: { dueDate: 'asc' },
          include: { document: { select: { documentNumber: true, insuranceCompany: true } } },
        }),
      ])

    const sections = [
      {
        title: '⚠️ Pólizas próximas a vencer (30 días)',
        color: '#f59e0b',
        rows: expiringPolicies.map((p) => [
          `<strong>${p.policyNumber}</strong>`,
          p.insuredName,
          p.company.name,
          formatDate(p.endDate),
          formatAmount(p.premium, p.currency),
        ]),
      },
      {
        title: '🧯 Matafuegos vencidos o próximos a vencer',
        color: '#ef4444',
        rows: expiringExtinguishers.map((e) => [
          e.code ?? e.id.substring(0, 8),
          e.location ?? e.locationType,
          e.type,
          formatDate(e.expirationDate),
          computeFireExtinguisherStatus(e.expirationDate, e.manufacturingYear, e.hydraulicTestExpirationDate) === 'vencido'
            ? '<span style="color:#ef4444; font-weight:bold;">VENCIDO</span>'
            : 'Próximo',
        ]),
      },
      {
        title: '📄 Cuotas vencidas sin pagar',
        color: '#dc2626',
        rows: overdueInstallments.map((i) => [
          i.document.documentNumber,
          i.document.insuranceCompany ?? '—',
          `Cuota #${i.installmentNumber}`,
          formatDate(i.dueDate),
          formatAmount(i.amount, i.currency),
        ]),
      },
      {
        title: '📅 Cuotas por vencer (7 días)',
        color: '#3b82f6',
        rows: nearInstallments.map((i) => [
          i.document.documentNumber,
          i.document.insuranceCompany ?? '—',
          `Cuota #${i.installmentNumber}`,
          formatDate(i.dueDate),
          formatAmount(i.amount, i.currency),
        ]),
      },
    ]

    const hasItems = sections.some((s) => s.rows.length > 0)
    const html = buildEmailHtml(sections)

    const recipient = toEmail ?? env.NOTIFICATION_TO
    if (!recipient) {
      throw new AppError(
        400,
        'No hay destinatario configurado. Pasá el email en el body o definí NOTIFICATION_TO en .env',
        'NO_RECIPIENT',
      )
    }

    const transporter = getTransporter()
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: recipient,
      subject: hasItems
        ? `⚠️ Vencimientos próximos — Sistema de Seguros LO (${formatDate(today)})`
        : `✅ Sin vencimientos próximos — Sistema de Seguros LO (${formatDate(today)})`,
      html,
    })

    return {
      sent: true,
      to: recipient,
      hasAlerts: hasItems,
      summary: {
        expiringPolicies: expiringPolicies.length,
        expiringExtinguishers: expiringExtinguishers.length,
        overdueInstallments: overdueInstallments.length,
        nearInstallments: nearInstallments.length,
      },
    }
  },

  async previewExpirations() {
    const today = todayDate()
    const in30Days = dateOffset(30)
    const in7Days = dateOffset(7)

    const [expiringPolicies, expiringExtinguishers, overdueInstallments, nearInstallments] =
      await Promise.all([
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
      ])

    return {
      expiringPolicies,
      expiringExtinguishers,
      overdueInstallments,
      nearInstallments,
      hasAlerts: expiringPolicies + expiringExtinguishers + overdueInstallments + nearInstallments > 0,
    }
  },
}
