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
import { fireExtinguisherLabel } from './format'
import { drawHorizontalBar, hexToRgb } from './pdfShapes'

const TRACK_GRAY: [number, number, number] = [243, 244, 246]

// PDF armado a mano con las primitivas de jsPDF (texto y figuras) — nada de
// html2canvas/capturas de pantalla. Prioriza gráficos de barra por sobre
// texto: cada campo es una barra por categoría (se omiten las categorías en
// 0 — es la reducción de texto más grande), y solo se nombran matafuegos
// puntuales para la categoría problemática de los campos "principales",
// con un tope (ver MAX_NAMED_ITEMS) para no volver a caer en una lista larga.

const EMPTY_BUCKET: FireExtinguisherFindingBucket = { count: 0, items: [] }
const SLATE_900: [number, number, number] = [15, 23, 42]
const SLATE_700: [number, number, number] = [51, 65, 85]
const SLATE_500: [number, number, number] = [100, 116, 139]
const AMBER_700: [number, number, number] = [180, 83, 9]

const MAX_NAMED_ITEMS = 4

interface TierRow {
  tier: string
  count: number
  color: string
  hasIssue: boolean
  namedText: string | null
}

// Una fila por categoría con al menos 1 matafuego — las categorías en 0 se
// omiten del todo, es lo que más recorta texto sin perder información real.
function buildTierRows(
  field: FindingsFieldDef,
  breakdown: Record<string, FireExtinguisherFindingBucket> | undefined,
  nameItems: boolean,
): TierRow[] {
  return field.tierOrder
    .map((tier, i) => {
      const bucket = breakdown?.[tier] ?? EMPTY_BUCKET
      const isGood = tier === field.goodTier
      const hasIssue = !isGood && bucket.count > 0
      let namedText: string | null = null
      if (nameItems && hasIssue) {
        const labels = bucket.items.map((it) => fireExtinguisherLabel(it.cylinderNumber, it.location, it.code))
        const shown = labels.slice(0, MAX_NAMED_ITEMS)
        const rest = labels.length - shown.length
        namedText = shown.join(', ') + (rest > 0 ? ` y ${rest} más` : '')
      }
      return { tier, count: bucket.count, color: TIER_COLORS[i % TIER_COLORS.length], hasIssue, namedText }
    })
    .filter((row) => row.count > 0)
}

interface FieldBlockOpts {
  x: number
  width: number
  labelColW: number
  countColW: number
  labelSize: number
  rowSize: number
  rowH: number
  barH: number
  namedTextSize: number
}

const PRIMARY_OPTS: Omit<FieldBlockOpts, 'x' | 'width'> = {
  labelColW: 46,
  countColW: 10,
  labelSize: 9.5,
  rowSize: 8,
  rowH: 5.2,
  barH: 3,
  namedTextSize: 7,
}

const SECONDARY_OPTS: Omit<FieldBlockOpts, 'x' | 'width'> = {
  labelColW: 34,
  countColW: 9,
  labelSize: 8.3,
  rowSize: 7.5,
  barH: 2.4,
  rowH: 4.3,
  namedTextSize: 7,
}

function measureFieldBlock(pdf: any, field: FindingsFieldDef, rows: TierRow[], opts: FieldBlockOpts): number {
  if (rows.length === 0) return 0
  let h = opts.labelSize / 2.2 + 2 // línea del título
  const gap = 3
  const barMaxW = opts.width - opts.labelColW - opts.countColW - gap * 2
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(opts.namedTextSize)
  for (const row of rows) {
    h += opts.rowH
    if (row.namedText) {
      const wrapped: string[] = pdf.splitTextToSize(row.namedText, barMaxW + opts.labelColW)
      h += wrapped.length * 3.2 + 0.8
    }
  }
  return h + 2.5
}

function drawFieldBlock(
  pdf: any,
  y: number,
  field: FindingsFieldDef,
  rows: TierRow[],
  denom: number,
  opts: FieldBlockOpts,
): number {
  if (rows.length === 0) return 0
  let cursorY = y
  const gap = 3
  const barMaxW = opts.width - opts.labelColW - opts.countColW - gap * 2

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(opts.labelSize)
  pdf.setTextColor(...SLATE_900)
  cursorY += opts.labelSize / 2.2
  pdf.text(field.label, opts.x, cursorY)
  cursorY += 2

  for (const row of rows) {
    cursorY += opts.rowH
    const barY = cursorY - opts.barH - 0.3
    const rgb = hexToRgb(row.color)

    const [tr, tg, tb] = row.hasIssue ? AMBER_700 : SLATE_700
    pdf.setFont('helvetica', row.hasIssue ? 'bold' : 'normal')
    pdf.setFontSize(opts.rowSize)
    pdf.setTextColor(tr, tg, tb)
    pdf.text(row.tier, opts.x, cursorY - 0.5)

    // Track de fondo, para que la barra siempre tenga referencia de escala.
    pdf.setFillColor(TRACK_GRAY[0], TRACK_GRAY[1], TRACK_GRAY[2])
    pdf.rect(opts.x + opts.labelColW, barY, barMaxW, opts.barH, 'F')
    const barW = denom > 0 ? (row.count / denom) * barMaxW : 0
    drawHorizontalBar(pdf, opts.x + opts.labelColW, barY, barW, opts.barH, row.color)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(opts.rowSize)
    pdf.setTextColor(rgb[0], rgb[1], rgb[2])
    pdf.text(String(row.count), opts.x + opts.labelColW + barMaxW + gap, cursorY - 0.5)

    if (row.namedText) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(opts.namedTextSize)
      pdf.setTextColor(...SLATE_500)
      const wrapped: string[] = pdf.splitTextToSize(row.namedText, barMaxW + opts.labelColW)
      wrapped.forEach((line) => {
        cursorY += 3.2
        pdf.text(line, opts.x + opts.labelColW, cursorY - 0.5)
      })
      cursorY += 0.8
    }
  }

  return cursorY - y + 2.5
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
    ensureSpace(16)
    printLine(est.establishment, { size: 12.5, bold: true, heightMm: 6 })

    // Barra de cobertura del establecimiento — reemplaza el resumen de
    // texto por algo que se lee de un vistazo (verde = auditado).
    const coverageBarW = 60
    const coverageBarY = cursor.y - 3
    pdf.setFillColor(TRACK_GRAY[0], TRACK_GRAY[1], TRACK_GRAY[2])
    pdf.rect(marginX, coverageBarY, coverageBarW, 3.2, 'F')
    const coveredW = est.total > 0 ? (est.audited / est.total) * coverageBarW : 0
    drawHorizontalBar(pdf, marginX, coverageBarY, coveredW, 3.2, '#10b981')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(SLATE_500[0], SLATE_500[1], SLATE_500[2])
    pdf.text(`${est.audited}/${est.total} auditados`, marginX + coverageBarW + 3, cursor.y - 0.7)
    cursor.y += 6.5

    for (const sector of est.sectors) {
      ensureSpace(10)
      printLine(sector.locationType, { x: marginX + 3, size: 10.5, bold: true, heightMm: 5 })
      printLine(`${sector.total} matafuego${sector.total !== 1 ? 's' : ''} · ${sector.audited} auditado${sector.audited !== 1 ? 's' : ''}`, {
        x: marginX + 3,
        size: 8,
        color: SLATE_500,
        heightMm: 5.5,
      })

      const blockX = marginX + 6
      const blockWidth = contentW - 6
      let anyField = false
      // "Vencimiento de carga" se calcula sobre TODOS los matafuegos activos
      // del sector (auditados o no — no depende del checklist); el resto de
      // los campos solo tiene datos de los efectivamente auditados este
      // período (mismo criterio que el backend, ver getFindingsReport).
      const denomFor = (field: FindingsFieldDef) => (field.key === 'expiration' ? sector.total : sector.audited)

      for (const field of PRIMARY_FIELDS) {
        const rows = buildTierRows(field, sector.fields[field.key], true)
        if (rows.length === 0) continue
        anyField = true
        const opts: FieldBlockOpts = { x: blockX, width: blockWidth, ...PRIMARY_OPTS }
        const h = measureFieldBlock(pdf, field, rows, opts)
        ensureSpace(h)
        drawFieldBlock(pdf, cursor.y, field, rows, denomFor(field), opts)
        cursor.y += h
      }

      for (const field of SECONDARY_FIELDS) {
        const rows = buildTierRows(field, sector.fields[field.key], false)
        if (rows.length === 0) continue
        anyField = true
        const opts: FieldBlockOpts = { x: blockX, width: blockWidth, ...SECONDARY_OPTS }
        const h = measureFieldBlock(pdf, field, rows, opts)
        ensureSpace(h)
        drawFieldBlock(pdf, cursor.y, field, rows, denomFor(field), opts)
        cursor.y += h
      }

      if (!anyField) {
        printLine('Sin hallazgos para mostrar en este sector.', { x: blockX, size: 8, color: SLATE_500, heightMm: 5 })
      }

      cursor.y += 3
    }
    cursor.y += 3
  }

  pdf.save(`informe-auditoria-matafuegos-${period}.pdf`)
}
