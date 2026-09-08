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

// Un Bien de Uso (con su importe/participación) dentro de un Centro de
// Costo. code/name en null cuando la línea no tiene Bien de Uso asociado —
// ahí no se inventa una etiqueta, el renglón se muestra en blanco.
export interface ManualDocumentBreakdownItem {
  code: string | null
  name: string | null
  amount: number
  percentage: number
}

// Un Centro de Costo con sus Bienes de Uso agrupados — un Centro de Costo
// puede tener uno, varios, o ninguno (un único ítem en blanco). El % del
// grupo (mostrado una sola vez, en la celda fusionada) es la suma de los
// ítems, así el total entre todos los Centros de Costo sigue dando 100%.
export interface ManualDocumentCostCenterGroup {
  code: string | null
  name: string | null
  items: ManualDocumentBreakdownItem[]
}

export interface ManualDocumentEmailAttachment {
  name: string
  fileUrl: string | null
  attached: boolean
}

export interface ManualDocumentEmailData {
  documentType: string
  documentTypeLabel: string
  documentNumber: string
  issueDate: string
  dueDate: string | null
  insuranceCompany: string | null
  paymentMethod: string | null
  currency: string
  totalAmount: number
  policyNumbers: string[]
  linkedDocumentNumber: string | null
  description: string | null
  adjustmentReason: string | null
  endorsementType: string | null
  endorsementEffectiveDate: string | null
  costCenters: ManualDocumentCostCenterGroup[]
  attachments: ManualDocumentEmailAttachment[]
  message?: string
}

export function buildManualDocumentSendEmail(data: ManualDocumentEmailData): { subject: string; html: string } {
  const context = data.policyNumbers.join(', ') || data.insuranceCompany
  const subject = `${data.documentTypeLabel} ${data.documentNumber}${context ? ` - ${context}` : ''}`

  const introByType: Record<string, string> = {
    INVOICE: 'Se informa la factura correspondiente.',
    CREDIT_NOTE: 'Se informa la nota de crédito correspondiente.',
    DEBIT_NOTE: 'Se informa la nota de débito correspondiente.',
    ENDORSEMENT: 'Se informa el endoso correspondiente.',
    ADJUSTMENT_ENTRY: 'Se informa el asiento de ajuste contable.',
  }
  const intro = introByType[data.documentType] ?? `Se informa el documento ${data.documentTypeLabel}.`

  const rows: string[] = [
    `<tr><td style="padding:4px 0; color:#6b7280;">Tipo de documento</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.documentTypeLabel)}</td></tr>`,
    `<tr><td style="padding:4px 0; color:#6b7280;">Número</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.documentNumber)}</td></tr>`,
    `<tr><td style="padding:4px 0; color:#6b7280;">Fecha</td><td style="padding:4px 0; text-align:right; font-weight:600;">${formatDate(data.issueDate)}</td></tr>`,
  ]
  if (data.dueDate) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Vencimiento</td><td style="padding:4px 0; text-align:right; font-weight:600;">${formatDate(data.dueDate)}</td></tr>`,
    )
  }
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
  if (data.policyNumbers.length > 0) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Póliza${data.policyNumbers.length > 1 ? 's' : ''}</td><td style="padding:4px 0; text-align:right; font-weight:600;">${data.policyNumbers.map(escapeHtml).join(', ')}</td></tr>`,
    )
  }
  if (data.linkedDocumentNumber) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Documento relacionado</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.linkedDocumentNumber)}</td></tr>`,
    )
  }
  if (data.endorsementEffectiveDate) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Vigencia del endoso</td><td style="padding:4px 0; text-align:right; font-weight:600;">${formatDate(data.endorsementEffectiveDate)}</td></tr>`,
    )
  }
  if (data.endorsementType) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Tipo de endoso</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.endorsementType)}</td></tr>`,
    )
  }
  if (data.adjustmentReason) {
    rows.push(
      `<tr><td style="padding:4px 0; color:#6b7280;">Motivo del ajuste</td><td style="padding:4px 0; text-align:right; font-weight:600;">${escapeHtml(data.adjustmentReason)}</td></tr>`,
    )
  }
  rows.push(
    `<tr><td style="padding:4px 0; color:#6b7280;">Total</td><td style="padding:4px 0; text-align:right; font-weight:600;">${formatAmount(data.totalAmount, data.currency)}</td></tr>`,
  )

  // Tabla real (con <thead>/rowspan) en vez de flexbox — muchos clientes de
  // mail (Outlook, algunos webmails) ignoran display:flex, pero rowspan
  // sobre <table> es HTML de tabla básico y sí se respeta. La celda de
  // Centro de Costo se fusiona verticalmente cuando tiene más de un Bien de
  // Uso (o un único renglón en blanco cuando no tiene ninguno).
  function costCenterGroupsHtml(): string {
    if (data.costCenters.length === 0) {
      return '<p style="color:#9ca3af; font-size:13px; font-style:italic;">Sin centros de costo asociados.</p>'
    }
    const cellStyle = 'padding:10px 12px; font-size:13px; border:1px solid #e5e7eb;'
    const rowsHtml = data.costCenters
      .map((group) => {
        const ccLabel = [group.code, group.name].filter(Boolean).map((s) => escapeHtml(s as string)).join(' — ') || '—'
        const ccPercentage = group.items.reduce((sum, item) => sum + item.percentage, 0)
        return group.items
          .map((item, i) => {
            const buLabel = item.code || item.name
              ? [item.code, item.name].filter(Boolean).map((s) => escapeHtml(s as string)).join(' — ')
              : ''
            const ccCell = i === 0
              ? `<td rowspan="${group.items.length}" style="${cellStyle} font-weight:600; color:#111827; vertical-align:top; background:#f9fafb;">
                  ${ccLabel}<br/><span style="font-weight:400; color:#6b7280;">${ccPercentage.toFixed(1)}%</span>
                </td>`
              : ''
            return `
              <tr>
                ${ccCell}
                <td style="${cellStyle} color:#374151;">${buLabel || '<span style="color:#9ca3af;">—</span>'}</td>
                <td style="${cellStyle} color:#374151; text-align:right; white-space:nowrap;">${formatAmount(item.amount, data.currency)}</td>
                <td style="${cellStyle} color:#6b7280; text-align:right; white-space:nowrap;">${item.percentage.toFixed(1)}%</td>
              </tr>`
          })
          .join('')
      })
      .join('')

    const headerStyle = 'padding:8px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#6b7280; text-align:left; border:1px solid #e5e7eb; background:#f3f4f6;'
    return `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="${headerStyle}">Centro de Costo</th>
            <th style="${headerStyle}">Bien de Uso</th>
            <th style="${headerStyle} text-align:right;">Importe</th>
            <th style="${headerStyle} text-align:right;">%</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
  }

  const costCentersHtml = costCenterGroupsHtml()

  const attachmentsHtml = data.attachments.length > 0
    ? `<p style="font-size:13px; font-weight:600; color:#374151; margin:16px 0 4px;">Adjuntos (${data.attachments.length})</p>
       <ul style="margin:8px 0 0; padding-left:18px; font-size:13px;">
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
    : ''

  const messageHtml = data.message
    ? `<div style="margin-top:20px; padding:14px 16px; background:#eff6ff; border-radius:8px; border:1px solid #bfdbfe;">
        <p style="margin:0; font-size:13px; color:#1e3a8a; white-space:pre-wrap;">${escapeHtml(data.message)}</p>
      </div>`
    : ''

  const descriptionHtml = data.description
    ? `<div style="margin-top:16px; padding:12px 14px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px;"><strong style="font-size:12px; color:#6b7280;">Descripción</strong><p style="margin:5px 0 0; font-size:13px; color:#374151; white-space:pre-wrap;">${escapeHtml(data.description)}</p></div>`
    : ''

  const bodyHtml = `
    <p style="margin:0 0 16px; color:#374151;">${intro}</p>
    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">${rows.join('')}</table>
    ${data.costCenters.length > 0 ? `<p style="font-size:13px; font-weight:600; color:#374151; margin:16px 0 8px;">Centros de Costo y Bienes de Uso</p>${costCentersHtml}` : ''}
    ${attachmentsHtml}
    ${descriptionHtml}
    ${messageHtml}`

  const html = wrapEmailShell('Sistema de Seguros LO', `${data.documentTypeLabel} — ${formatDate(new Date().toISOString().slice(0, 10))}`, bodyHtml)

  return { subject, html }
}
