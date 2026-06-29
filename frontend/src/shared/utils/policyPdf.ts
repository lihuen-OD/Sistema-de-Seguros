import type { Policy, Producer, Asset, Company, CostCenter, AccountingDocument } from '../types'
import { formatDate, formatCurrencyFull } from './format'
import { PAYMENT_STATUS_LABELS, POLICY_STATUS_LABELS } from '../constants'

export interface PolicyPdfData {
  policy: Policy
  producer?: Producer | null
  asset?: Asset | null
  company?: Company | null
  costCenter?: CostCenter | null
  documents: AccountingDocument[]
}

export function exportPolicyToPdf(data: PolicyPdfData): void {
  const html = buildHtml(data)

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1px;height:1px;opacity:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  // Wait for resources (fonts, styles) to load before printing
  const doprint = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    // Remove after print dialog closes
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe)
    }, 2000)
  }

  if (iframe.contentDocument?.readyState === 'complete') {
    setTimeout(doprint, 300)
  } else {
    iframe.addEventListener('load', () => setTimeout(doprint, 300), { once: true })
  }
}

// ─── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  return POLICY_STATUS_LABELS[status] ?? status
}

function statusBadgeStyle(status: string): string {
  if (status === 'vigente')         return 'background:#dcfce7;color:#15803d;'
  if (status === 'vencida')         return 'background:#fee2e2;color:#b91c1c;'
  if (status === 'proximo_vencer')  return 'background:#fef3c7;color:#b45309;'
  return 'background:#f1f5f9;color:#475569;'
}

// ─── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(data: PolicyPdfData): string {
  const { policy, producer, asset, company, costCenter, documents } = data

  const now = new Date()
  const generatedDate = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const generatedTime = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const badgeStyle = statusBadgeStyle(policy.status)
  const label = statusLabel(policy.status)

  // Association block
  const associationHtml = asset
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;">
        <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:0 0 4px;">Activo Asegurado</p>
        <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px;">${asset.name}</p>
        <p style="font-size:11px;color:#64748b;margin:0;">${asset.internalCode} &nbsp;·&nbsp; ${asset.assetType}</p>
       </div>`
    : `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
        ${field('Empresa', company?.name ?? '—')}
        ${field('Centro de Costo', costCenter ? `${costCenter.code} — ${costCenter.name}` : '—')}
        ${field('Descripción CC', costCenter?.description ?? '—')}
       </div>`

  // Documents table rows
  const docsRows = documents.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:14px 10px;color:#94a3b8;font-style:italic;">Sin documentos contables asociados a esta póliza.</td></tr>`
    : documents.map((d) => `
        <tr>
          <td style="font-family:monospace;font-size:11px;">${d.documentNumber}</td>
          <td>${d.documentType}</td>
          <td>${formatDate(d.issueDate)}</td>
          <td>${d.currency}</td>
          <td style="text-align:right;font-weight:600;">${formatCurrencyFull(d.totalAmount, d.currency)}</td>
          <td>${PAYMENT_STATUS_LABELS[d.paymentStatus] ?? d.paymentStatus}</td>
        </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Póliza ${policy.policyNumber}</title>
  <style>
    @page { size: A4; margin: 18mm 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #0f172a;
      font-size: 12px;
      line-height: 1.5;
    }
    .page { max-width: 100%; }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 14px;
      margin-bottom: 20px;
      border-bottom: 2px solid #1d4ed8;
    }
    .category {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: #1d4ed8;
      margin-bottom: 5px;
    }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.2; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 3px; }
    .badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      margin-top: 6px;
    }
    section { margin-bottom: 18px; page-break-inside: avoid; }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #64748b;
      padding-bottom: 5px;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .field-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #94a3b8;
      margin-bottom: 2px;
    }
    .field-value { font-size: 12px; font-weight: 500; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th {
      background: #f8fafc;
      padding: 7px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
    }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <p class="category">Póliza de Seguro</p>
      <h1 class="title">${policy.policyNumber}</h1>
      <p class="subtitle">${policy.insuranceCompany} &nbsp;·&nbsp; ${policy.insuranceType} &nbsp;·&nbsp; ${policy.coverageType}</p>
    </div>
    <span class="badge" style="${badgeStyle}">${label}</span>
  </div>

  <!-- Datos de la Póliza -->
  <section>
    <p class="section-title">Datos de la Póliza</p>
    <div class="grid">
      ${field('N° Póliza', policy.policyNumber, true)}
      ${field('Compañía Aseguradora', policy.insuranceCompany)}
      ${field('Productor Asesor', producer?.name ?? '—')}
      ${field('Tipo de Seguro', policy.insuranceType)}
      ${field('Tipo de Cobertura', policy.coverageType)}
      <div>
        <p class="field-label">Estado</p>
        <span class="badge" style="${badgeStyle}">${label}</span>
      </div>
    </div>
  </section>

  <!-- Vigencia -->
  <section>
    <p class="section-title">Vigencia</p>
    <div class="grid">
      ${field('Fecha de Inicio', formatDate(policy.startDate))}
      ${field('Fecha de Vencimiento', formatDate(policy.endDate))}
    </div>
    ${policy.description ? `
      <div style="margin-top:12px;">
        <p class="field-label">Descripción</p>
        <p style="font-size:12px;color:#334155;line-height:1.6;margin-top:2px;">${policy.description}</p>
      </div>` : ''}
  </section>

  <!-- Asociación -->
  <section>
    <p class="section-title">${asset ? 'Activo Asegurado' : 'Imputación Contable'}</p>
    ${associationHtml}
  </section>

  <!-- Importes -->
  <section>
    <p class="section-title">Importes</p>
    <div class="grid">
      <div>
        <p class="field-label">Suma Asegurada (ARS)</p>
        <p style="font-size:14px;font-weight:700;color:#0f172a;">${formatCurrencyFull(policy.insuredAmountArs, 'ARS')}</p>
      </div>
      <div>
        <p class="field-label">Tipo de Cambio (ARS/USD)</p>
        <p class="field-value">$ ${policy.exchangeRate.toLocaleString('es-AR')}</p>
      </div>
      <div>
        <p class="field-label">Suma Asegurada (USD)</p>
        <p style="font-size:14px;font-weight:700;color:#1d4ed8;">${formatCurrencyFull(policy.insuredAmountUsd, 'USD')}</p>
      </div>
    </div>
  </section>

  <!-- Documentos Contables -->
  <section>
    <p class="section-title">Documentos Contables Asociados (${documents.length})</p>
    <table>
      <thead>
        <tr>
          <th>N° Documento</th>
          <th>Tipo</th>
          <th>Emisión</th>
          <th>Moneda</th>
          <th style="text-align:right;">Total</th>
          <th>Estado Pago</th>
        </tr>
      </thead>
      <tbody>
        ${docsRows}
      </tbody>
    </table>
  </section>

  <!-- Footer -->
  <div class="footer">
    <span>Sistema de Administración Patrimonial y Seguros</span>
    <span>Generado el ${generatedDate} a las ${generatedTime}</span>
  </div>

</div>
</body>
</html>`
}

function field(label: string, value: string, mono = false): string {
  return `<div>
    <p class="field-label">${label}</p>
    <p class="field-value" ${mono ? 'style="font-family:monospace;"' : ''}>${value}</p>
  </div>`
}
