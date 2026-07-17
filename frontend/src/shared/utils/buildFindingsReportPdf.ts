import type {
  FireExtinguisherFindingsEstablishment,
  FireExtinguisherFindingBucket,
} from '../api/fire-extinguisher-audits.api'
import {
  PRIMARY_FIELDS,
  SECONDARY_FIELDS,
  TIER_COLORS,
  formatPeriodLabel,
  type FindingsFieldDef,
} from '../../modules/fire-extinguishers/audits/findingsReportFields'
import { drawPieChart } from './pdfShapes'

// PDF armado a mano con las primitivas de jsPDF (texto y figuras) — nada de
// html2canvas/capturas de pantalla. Como el contenido de cada bloque se mide
// ANTES de dibujarlo, un salto de página nunca cae a mitad de un bloque.

const EMPTY_BUCKET: FireExtinguisherFindingBucket = { count: 0, items: [] }
const SLATE_900: [number, number, number] = [15, 23, 42]
const SLATE_700: [number, number, number] = [51, 65, 85]
const SLATE_500: [number, number, number] = [100, 116, 139]
const AMBER_700: [number, number, number] = [180, 83, 9]

interface FieldLine {
  text: string
  indent: number
  size: number
  bold: boolean
  color: [number, number, number]
  heightMm: number
}

function buildPrimaryFieldLines(
  pdf: any,
  field: FindingsFieldDef,
  breakdown: Record<string, FireExtinguisherFindingBucket> | undefined,
  textWidthMm: number,
): { lines: FieldLine[]; chartData: { value: number; color: string }[] } {
  const lines: FieldLine[] = [{ text: field.label, indent: 0, size: 9.5, bold: true, color: SLATE_900, heightMm: 5 }]
  const chartData: { value: number; color: string }[] = []

  field.tierOrder.forEach((tier, i) => {
    const bucket = breakdown?.[tier] ?? EMPTY_BUCKET
    const isGood = tier === field.goodTier
    const hasIssue = !isGood && bucket.count > 0
    chartData.push({ value: bucket.count, color: TIER_COLORS[i % TIER_COLORS.length] })

    lines.push({
      text: `${tier}: ${bucket.count}`,
      indent: 2,
      size: 8.5,
      bold: hasIssue,
      color: hasIssue ? AMBER_700 : SLATE_700,
      heightMm: 4.3,
    })

    if (hasIssue) {
      const codesStr = bucket.items.map((it) => it.code).join(', ')
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.3)
      const wrapped: string[] = pdf.splitTextToSize(codesStr, textWidthMm - 4)
      wrapped.forEach((wline) => {
        lines.push({ text: wline, indent: 4, size: 7.3, bold: false, color: SLATE_500, heightMm: 3.5 })
      })
    }
  })

  return { lines, chartData }
}

function secondaryFieldLine(field: FindingsFieldDef, breakdown: Record<string, FireExtinguisherFindingBucket> | undefined): string {
  const parts = field.tierOrder.map((tier) => `${tier}: ${(breakdown?.[tier] ?? EMPTY_BUCKET).count}`)
  return `${field.label} — ${parts.join(' · ')}`
}

export async function buildFindingsReportPdf(
  period: string,
  establishments: FireExtinguisherFindingsEstablishment[],
): Promise<void> {
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

  function printLine(
    text: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: [number, number, number]; heightMm?: number } = {},
  ) {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    pdf.setFontSize(opts.size ?? 9)
    const [r, g, b] = opts.color ?? SLATE_900
    pdf.setTextColor(r, g, b)
    pdf.text(text, opts.x ?? marginX, cursor.y)
    cursor.y += opts.heightMm ?? 5
  }

  ensureSpace(16)
  printLine('Informe de auditoría — Matafuegos', { size: 15, bold: true, heightMm: 6.5 })
  printLine(formatPeriodLabel(period), { size: 10, color: SLATE_500, heightMm: 8 })

  if (establishments.length === 0) {
    printLine('No hay sectores seleccionados para este informe.', { size: 9.5, color: SLATE_500 })
    pdf.save(`informe-auditoria-matafuegos-${period}.pdf`)
    return
  }

  for (const est of establishments) {
    ensureSpace(12)
    printLine(est.establishment, { size: 12.5, bold: true, heightMm: 6 })
    printLine(
      `${est.total} matafuego${est.total !== 1 ? 's' : ''} · ${est.audited} auditado${est.audited !== 1 ? 's' : ''} · ${est.total - est.audited} sin auditar`,
      { size: 8.3, color: SLATE_500, heightMm: 6 },
    )

    for (const sector of est.sectors) {
      ensureSpace(11)
      printLine(sector.locationType, { x: marginX + 3, size: 10.5, bold: true, heightMm: 5.5 })
      printLine(
        `${sector.total} matafuego${sector.total !== 1 ? 's' : ''} · ${sector.audited} auditado${sector.audited !== 1 ? 's' : ''}`,
        { x: marginX + 3, size: 8, color: SLATE_500, heightMm: 5.5 },
      )

      const textX = marginX + 6
      const textWidth = contentW - 6 - 34 // deja lugar al gráfico de torta a la derecha

      for (const field of PRIMARY_FIELDS) {
        const { lines, chartData } = buildPrimaryFieldLines(pdf, field, sector.fields[field.key], textWidth)
        const nonZero = chartData.filter((d) => d.value > 0)
        const showChart = nonZero.length >= 2
        const textH = lines.reduce((s, l) => s + l.heightMm, 0)
        const chartH = showChart ? 30 : 0
        const blockH = Math.max(textH, chartH) + 3

        ensureSpace(blockH)
        const blockStartY = cursor.y

        for (const l of lines) {
          pdf.setFont('helvetica', l.bold ? 'bold' : 'normal')
          pdf.setFontSize(l.size)
          pdf.setTextColor(l.color[0], l.color[1], l.color[2])
          pdf.text(l.text, textX + l.indent, cursor.y)
          cursor.y += l.heightMm
        }

        if (showChart) {
          drawPieChart(pdf, textX + textWidth + 16, blockStartY + 10, 9, nonZero)
        }

        cursor.y = blockStartY + blockH
      }

      for (const field of SECONDARY_FIELDS) {
        ensureSpace(5)
        printLine(secondaryFieldLine(field, sector.fields[field.key]), {
          x: textX,
          size: 8,
          color: SLATE_700,
          heightMm: 4.6,
        })
      }

      cursor.y += 3
    }
    cursor.y += 3
  }

  pdf.save(`informe-auditoria-matafuegos-${period}.pdf`)
}
