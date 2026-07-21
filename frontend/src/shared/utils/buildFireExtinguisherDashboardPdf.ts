import type { FireExtinguisherDashboardSummary } from '../api/fire-extinguishers.api'
import { formatDate } from './format'
import { FIRE_EXT_AUDIT_STATUS_LABELS } from '../constants'
import { drawPieChart, drawHorizontalBar } from './pdfShapes'

// PDF armado a mano con las primitivas de jsPDF (texto y figuras) — nada de
// html2canvas/capturas de pantalla, mismo criterio que buildFindingsReportPdf.

const SLATE_900: [number, number, number] = [15, 23, 42]
const SLATE_600: [number, number, number] = [71, 85, 105]
const SLATE_400: [number, number, number] = [148, 163, 184]
const WHITE: [number, number, number] = [255, 255, 255]
const BORDER: [number, number, number] = [226, 232, 240]

const STATUS_COLORS = { vigente: '#10b981', proximo_vencer: '#f59e0b', vencido: '#ef4444' }
const TYPE_CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const KPI_COLORS: Record<'default' | 'success' | 'warning' | 'danger' | 'info', string> = {
  default: '#64748b',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2C5530',
}

interface StatBox {
  label: string
  value: string
  description: string
  variant: keyof typeof KPI_COLORS
}

export async function buildFireExtinguisherDashboardPdf(data: FireExtinguisherDashboardSummary): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 14
  const maxY = pageH - 14
  const contentW = pageW - marginX * 2

  const cursor = { y: 18 }

  function ensureSpace(neededMm: number) {
    if (cursor.y + neededMm > maxY) {
      pdf.addPage()
      cursor.y = 18
    }
  }

  function setStyle(size: number, bold = false, color: [number, number, number] = SLATE_900) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(color[0], color[1], color[2])
  }

  function printLine(
    text: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: [number, number, number]; heightMm?: number } = {},
  ) {
    setStyle(opts.size ?? 9, opts.bold, opts.color ?? SLATE_900)
    pdf.text(text, opts.x ?? marginX, cursor.y)
    cursor.y += opts.heightMm ?? 5
  }

  function sectionHeading(title: string, subtitle?: string) {
    ensureSpace(subtitle ? 13 : 9)
    printLine(title, { size: 11.5, bold: true, heightMm: 5.5 })
    if (subtitle) printLine(subtitle, { size: 8, color: SLATE_400, heightMm: 6.5 })
  }

  function hexTriplet(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function drawStatRow(boxes: StatBox[]) {
    const gap = 3
    const boxW = (contentW - gap * (boxes.length - 1)) / boxes.length
    const boxH = 23
    ensureSpace(boxH + 5)
    const y = cursor.y

    boxes.forEach((box, i) => {
      const x = marginX + i * (boxW + gap)
      const accent = hexTriplet(KPI_COLORS[box.variant])

      pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
      pdf.setLineWidth(0.25)
      pdf.setFillColor(WHITE[0], WHITE[1], WHITE[2])
      pdf.rect(x, y, boxW, boxH, 'FD')
      pdf.setFillColor(accent[0], accent[1], accent[2])
      pdf.rect(x, y, 1.1, boxH, 'F')

      setStyle(7.3, false, SLATE_400)
      pdf.text(box.label.toUpperCase(), x + 4, y + 6.5)

      setStyle(16, true, SLATE_900)
      pdf.text(box.value, x + 4, y + 15)

      setStyle(6.8, false, SLATE_600)
      const descLines: string[] = pdf.splitTextToSize(box.description, boxW - 6)
      pdf.text(descLines[0] ?? '', x + 4, y + 19.5)
    })

    cursor.y = y + boxH + 5
  }

  // ── Título ────────────────────────────────────────────────────────────────
  ensureSpace(16)
  printLine('Dashboard de Matafuegos', { size: 15, bold: true, heightMm: 6.5 })
  printLine(`Estado del parque y cobertura de auditoría · Período ${data.audits.currentPeriod}`, {
    size: 9.5,
    color: SLATE_600,
    heightMm: 8,
  })

  // ── KPIs del parque ──────────────────────────────────────────────────────
  drawStatRow([
    { label: 'Total', value: String(data.totals.total), description: 'Matafuegos activos', variant: 'default' },
    { label: 'Vigentes', value: String(data.totals.vigente), description: 'Con carga al día', variant: 'success' },
    {
      label: 'Próximos a Vencer',
      value: String(data.totals.proximo_vencer),
      description: 'Vencen en 30 días o menos',
      variant: 'warning',
    },
    {
      label: 'Vencidos',
      value: String(data.totals.vencido),
      description: 'Requieren recarga inmediata',
      variant: data.totals.vencido > 0 ? 'danger' : 'default',
    },
  ])

  // ── KPIs de auditoría ────────────────────────────────────────────────────
  drawStatRow([
    {
      label: 'Cobertura de auditoría',
      value: `${data.audits.coveragePercent}%`,
      description: `${data.audits.auditedThisPeriod} de ${data.audits.totalActive} matafuegos`,
      variant: 'info',
    },
    {
      label: 'Pendientes de revisión',
      value: String(data.audits.pendingReview),
      description: 'Auditorías esperando decisión',
      variant: data.audits.pendingReview > 0 ? 'warning' : 'default',
    },
    {
      label: 'Necesitan corrección',
      value: String(data.audits.needsCorrection),
      description: 'Devueltas al auditor',
      variant: data.audits.needsCorrection > 0 ? 'danger' : 'default',
    },
  ])

  // ── Estado del parque (torta) + Distribución por tipo (barras) ──────────
  sectionHeading('Estado del parque y distribución por tipo')

  const pieColW = contentW * 0.32
  const barColW = contentW - pieColW - 8
  const barColX = marginX + pieColW + 8
  const blockTopY = cursor.y
  const pieR = 15

  const statusSegments = [
    { value: data.totals.vigente, color: STATUS_COLORS.vigente },
    { value: data.totals.proximo_vencer, color: STATUS_COLORS.proximo_vencer },
    { value: data.totals.vencido, color: STATUS_COLORS.vencido },
  ]
  const pieCx = marginX + pieColW / 2
  const pieCy = blockTopY + pieR + 1
  drawPieChart(pdf, pieCx, pieCy, pieR, statusSegments)

  let legendY = pieCy + pieR + 7
  const legendItems = [
    { label: 'Vigentes', value: data.totals.vigente, color: STATUS_COLORS.vigente },
    { label: 'Próx. a Vencer', value: data.totals.proximo_vencer, color: STATUS_COLORS.proximo_vencer },
    { label: 'Vencidos', value: data.totals.vencido, color: STATUS_COLORS.vencido },
  ]
  legendItems.forEach((item) => {
    const [r, g, b] = hexTriplet(item.color)
    pdf.setFillColor(r, g, b)
    pdf.circle(marginX + 4, legendY - 1.1, 1.2, 'F')
    setStyle(7.5, false, SLATE_600)
    pdf.text(`${item.label}: ${item.value}`, marginX + 8, legendY)
    legendY += 4.6
  })

  let barY = blockTopY + 2
  const maxTypeVal = Math.max(1, ...data.byType.map((t) => t.count))
  const barLabelW = 38
  const barValueW = 10
  const barAreaW = barColW - barLabelW - barValueW

  if (data.byType.length === 0) {
    setStyle(8.5, false, SLATE_400)
    pdf.text('Sin datos', barColX, barY + 4)
  } else {
    data.byType.forEach((t, i) => {
      setStyle(7.3, false, SLATE_600)
      const label: string[] = pdf.splitTextToSize(t.type, barLabelW - 2)
      pdf.text(label[0] ?? t.type, barColX, barY + 3.2)
      const barW = (t.count / maxTypeVal) * barAreaW
      drawHorizontalBar(pdf, barColX + barLabelW, barY, barW, 4.6, TYPE_CHART_COLORS[i % TYPE_CHART_COLORS.length])
      setStyle(7.8, true, SLATE_900)
      pdf.text(String(t.count), barColX + barLabelW + barW + 2, barY + 3.2)
      barY += 7.2
    })
  }

  cursor.y = Math.max(legendY, barY, blockTopY + pieR * 2 + 4) + 4

  // ── Mapa de establecimientos ─────────────────────────────────────────────
  sectionHeading('Mapa de establecimientos', 'Vista esquemática — no geográfica')

  if (data.byEstablishment.length === 0) {
    printLine('Sin establecimientos para mostrar.', { size: 9, color: SLATE_400 })
  } else {
    data.byEstablishment.forEach((zone) => {
      const extraLines = zone.byLocationType.length > 1 ? zone.byLocationType.length : 0
      ensureSpace(10 + extraLines * 3.9)
      printLine(zone.establishment, { size: 9.5, bold: true, heightMm: 4.6 })
      printLine(
        `Total: ${zone.total} · Vigentes: ${zone.vigente} · Próx.: ${zone.proximo_vencer} · Vencidos: ${zone.vencido}`,
        { x: marginX + 3, size: 7.8, color: SLATE_600, heightMm: 4.4 },
      )
      if (zone.byLocationType.length > 1) {
        zone.byLocationType.forEach((lt) => {
          printLine(`${lt.locationType}: ${lt.total}`, { x: marginX + 6, size: 7.3, color: SLATE_400, heightMm: 3.7 })
        })
      }
      cursor.y += 1.8
    })
  }

  // ── Actividad reciente de auditorías ─────────────────────────────────────
  sectionHeading('Actividad reciente de auditorías')

  if (data.recentAudits.length === 0) {
    printLine('Todavía no se registraron auditorías.', { size: 9, color: SLATE_400 })
  } else {
    const cols = [
      { header: 'Matafuego', x: marginX, w: 34 },
      { header: 'Período', x: marginX + 36, w: 18 },
      { header: 'Auditor', x: marginX + 56, w: 58 },
      { header: 'Fecha', x: marginX + 116, w: 20 },
      { header: 'Estado', x: marginX + 138, w: 30 },
    ]

    ensureSpace(9)
    setStyle(7.3, true, SLATE_400)
    cols.forEach((c) => pdf.text(c.header.toUpperCase(), c.x, cursor.y))
    cursor.y += 3
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2])
    pdf.line(marginX, cursor.y, marginX + contentW, cursor.y)
    cursor.y += 4

    data.recentAudits.forEach((audit) => {
      ensureSpace(6.5)
      setStyle(8.2, false, SLATE_900)
      pdf.text(audit.extinguisherCode, cols[0].x, cursor.y)
      setStyle(8, false, SLATE_600)
      pdf.text(audit.auditPeriod, cols[1].x, cursor.y)
      const auditorLine: string[] = pdf.splitTextToSize(audit.auditedBy, cols[2].w)
      pdf.text(auditorLine[0] ?? audit.auditedBy, cols[2].x, cursor.y)
      pdf.text(formatDate(audit.createdAt), cols[3].x, cursor.y)
      pdf.text(FIRE_EXT_AUDIT_STATUS_LABELS[audit.status] ?? audit.status, cols[4].x, cursor.y)
      cursor.y += 6.5
    })
  }

  const date = new Date().toISOString().slice(0, 10)
  pdf.save(`dashboard-matafuegos-${date}.pdf`)
}
