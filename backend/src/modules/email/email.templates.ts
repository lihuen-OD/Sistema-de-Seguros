import { env } from '../../config/env'

// Escapa texto libre antes de interpolarlo en HTML — nunca se acepta HTML
// crudo proveniente del frontend (ver mensaje libre del usuario).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAmount(amount: number, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}/${m}/${y}`
}

const HEADER_COLOR = '#1a1a2e'

function wrapEmailShell(title: string, subtitle: string, bodyHtml: string): string {
  return `
    <html><body style="font-family: Arial, sans-serif; background:#f5f5f5; padding: 20px;">
      <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1);">
        <div style="background:${HEADER_COLOR}; color:#fff; padding:24px; text-align:center;">
          <h1 style="margin:0; font-size:20px;">${title}</h1>
          <p style="margin:8px 0 0; opacity:.7; font-size:13px;">${subtitle}</p>
        </div>
        <div style="padding:24px; color:#333; font-size:14px; line-height:1.5;">
          ${bodyHtml}
        </div>
        <div style="background:#f9fafb; padding:14px; text-align:center; font-size:11px; color:#9ca3af; border-top:1px solid #e5e7eb;">
          Sistema de Seguros LO · No respondas directamente a este mail salvo que necesites contactar a quien lo envió.
        </div>
      </div>
    </body></html>`
}

// Un ítem de reparto (centro de costo o bien de uso) sobre el total del
// documento — flat, sin agrupar por póliza.
export interface ManualDocumentBreakdownItem {
  code: string | null
  name: string | null
  amount: number
  percentage: number
}

export interface ManualDocumentEmailAttachment {
  name: string
  fileUrl: string | null
  attached: boolean
}

export interface ManualDocumentEmailData {
  documentId: string
  documentTypeLabel: string
  documentNumber: string
  insuranceCompany: string | null
  paymentMethod: string | null
  currency: string
  totalAmount: number
  costCenters: ManualDocumentBreakdownItem[]
  assets: ManualDocumentBreakdownItem[]
  attachments: ManualDocumentEmailAttachment[]
  message?: string
}

export function buildManualDocumentSendEmail(data: ManualDocumentEmailData): { subject: string; html: string } {
  const subject = `Documento ${data.documentTypeLabel} ${data.documentNumber}${
    data.insuranceCompany ? ` — ${data.insuranceCompany}` : ''
  }`

  const rows: string[] = [
    `<tr><td style="padding:4px 0; color:#6b7280;">Tipo de documento</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.documentTypeLabel)}</td></tr>`,
    `<tr><td style="padding:4px 0; color:#6b7280;">Número</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.documentNumber)}</td></tr>`,
  ]
  if (data.insuranceCompany) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Compañía</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.insuranceCompany)}</td></tr>`,
    )
  }
  if (data.paymentMethod) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Forma de pago</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.paymentMethod)}</td></tr>`,
    )
  }
  rows.push(
    `<tr><td style="padding:4px 0; color:#6b7280;">Total</td><td style="padding:4px 0; text-align:right; font-weight:600;">${formatAmount(data.totalAmount, data.currency)}</td></tr>`,
  )

  // Tabla en vez de flexbox — muchos clientes de mail (Outlook, algunos
  // webmails) ignoran display:flex y renderizan todo pegado en una línea.
  function breakdownRow(item: ManualDocumentBreakdownItem): string {
    const label = [item.code, item.name].filter(Boolean).map((s) => escapeHtml(s as string)).join(' — ') || '—'
    return `
      <table style="width:100%; border-collapse:collapse; margin-bottom:8px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px;">
        <tr>
          <td style="padding:10px 12px; font-size:13px; font-weight:600; color:#111827;">${label}</td>
          <td style="padding:10px 16px 10px 24px; font-size:13px; color:#374151; text-align:right; white-space:nowrap; width:1%;">${item.percentage.toFixed(1)}%</td>
        </tr>
      </table>`
  }

  const costCentersHtml =
    data.costCenters.length === 0
      ? '<p style="color:#9ca3af; font-size:13px; font-style:italic;">Sin centros de costo asociados.</p>'
      : data.costCenters.map(breakdownRow).join('')

  const assetsHtml =
    data.assets.length === 0
      ? '<p style="color:#9ca3af; font-size:13px; font-style:italic;">Sin bienes de uso asociados.</p>'
      : data.assets.map(breakdownRow).join('')

  const attachmentsHtml =
    data.attachments.length === 0
      ? '<p style="color:#9ca3af; font-size:13px; font-style:italic;">Sin adjuntos.</p>'
      : `<ul style="margin:8px 0 0; padding-left:18px; font-size:13px;">
          ${data.attachments
            .map((att) => {
              const label = escapeHtml(att.name)
              if (att.attached) {
                return `<li style="margin-bottom:4px;">${label} — <strong style="color:#16a34a;">adjunto a este mail</strong></li>`
              }
              if (att.fileUrl) {
                return `<li style="margin-bottom:4px;">${label} — <a href="${att.fileUrl}" style="color:#2563eb;">ver / descargar</a></li>`
              }
              return `<li style="margin-bottom:4px;">${label} — <span style="color:#9ca3af;">no disponible</span></li>`
            })
            .join('')}
        </ul>`

  const messageHtml = data.message
    ? `<div style="margin-top:20px; padding:14px 16px; background:#eff6ff; border-radius:8px; border:1px solid #bfdbfe;">
        <p style="margin:0; font-size:13px; color:#1e3a8a; white-space:pre-wrap;">${escapeHtml(data.message)}</p>
      </div>`
    : ''

  const link = `${env.FRONTEND_URL}/insurance/documents/${data.documentId}`

  const bodyHtml = `
    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">${rows.join('')}</table>
    <p style="font-size:13px; font-weight:600; color:#374151; margin:16px 0 4px;">Centros de Costo</p>
    ${costCentersHtml}
    <p style="font-size:13px; font-weight:600; color:#374151; margin:16px 0 4px;">Bienes de Uso</p>
    ${assetsHtml}
    <p style="font-size:13px; font-weight:600; color:#374151; margin:16px 0 4px;">Adjuntos (${data.attachments.length})</p>
    ${attachmentsHtml}
    ${messageHtml}
    <div style="margin-top:24px; text-align:center;">
      <a href="${link}" style="display:inline-block; padding:10px 20px; background:${HEADER_COLOR}; color:#fff; text-decoration:none; border-radius:6px; font-size:13px; font-weight:600;">
        Ver en la plataforma
      </a>
    </div>`

  const html = wrapEmailShell('Sistema de Seguros LO', `${data.documentTypeLabel} — ${formatDate(new Date().toISOString().slice(0, 10))}`, bodyHtml)

  return { subject, html }
}
