import type { AuditDashboardSector, AuditFlaggedExtinguisher } from '../api/fire-extinguisher-audits.api'
import { formatPeriodLabel } from '../../modules/fire-extinguishers/audits/findingsReportFields'
import { drawHorizontalBar } from './pdfShapes'
import { classifyLevel } from './auditLevel'

// PDF armado a mano con las primitivas de jsPDF (texto y figuras) — nada de
// html2canvas/capturas de pantalla. Mismo estilo que ve la pantalla "Informe
// de auditoría" para el detalle por sector: nivel % + barra por punto de
// control. A diferencia de la pantalla, el PDF no incluye el resumen global
// ("Nivel general" / "Nivel por punto de control") — solo tiene sentido en
// pantalla como vista ejecutiva, no en la hoja que se le manda a la persona
// que limpia/recarga matafuegos. Solo incluye los sectores recibidos (los
// tildados en pantalla). Por sector, además, lista (por detalle de ubicación,
// o número de cilindro si no hay detalle cargado) los matafuegos vencidos y
// los que necesitan limpieza — la persona que va a limpiar/recargar necesita
// saber cuáles son, no solo el nivel % del sector.

const TRACK_GRAY: [number, number, number] = [243, 244, 246]
const SLATE_900: [number, number, number] = [15, 23, 42]
const SLATE_500: [number, number, number] = [100, 116, 139]
const RED_600: [number, number, number] = [220, 38, 38]
const AMBER_600: [number, number, number] = [217, 119, 6]
const BAR_COLOR = '#334155' // slate-700
const BAR_COLOR_CRITICAL = '#ef4444' // red-500

// Identifica el matafuego por "Detalle de ubicación" (el nombre puntual que
// la persona reconoce en el campo, ej. "Portón norte") — es un campo
// opcional, así que si no está cargado se cae al número de cilindro (y el
// backend a su vez cae al código interno si tampoco hay número de cilindro).
function formatExtinguisherList(items: AuditFlaggedExtinguisher[]): string {
  return items.map((i) => i.location ?? i.cylinderNumber).join(', ')
}

function groupByEstablishment(sectors: AuditDashboardSector[]): { establishment: string; sectors: AuditDashboardSector[] }[] {
  const map = new Map<string, AuditDashboardSector[]>()
  for (const s of sectors) {
    if (!map.has(s.establishment)) map.set(s.establishment, [])
    map.get(s.establishment)!.push(s)
  }
  return [...map.entries()].map(([establishment, secs]) => ({ establishment, sectors: secs }))
}

export async function buildAuditDashboardPdf(period: string, sectors: AuditDashboardSector[]): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 14
  const maxY = pageH - 14
  const contentW = pdf.internal.pageSize.getWidth() - marginX * 2

  const cursor = { y: 18 }

  function ensureSpace(neededMm: number) {
    if (cursor.y + neededMm > maxY) {
      pdf.addPage()
      cursor.y = 18
    }
  }

  function printLine(
    text: string,
    opts: {
      x?: number
      size?: number
      bold?: boolean
      color?: [number, number, number]
      heightMm?: number
      maxWidth?: number
    } = {},
  ) {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    pdf.setFontSize(opts.size ?? 9)
    const lineHeight = opts.heightMm ?? 5
    const x = opts.x ?? marginX
    const lines = opts.maxWidth ? (pdf.splitTextToSize(text, opts.maxWidth) as string[]) : [text]
    ensureSpace(lineHeight * lines.length)
    const [r, g, b] = opts.color ?? SLATE_900
    pdf.setTextColor(r, g, b)
    pdf.text(lines, x, cursor.y)
    cursor.y += lineHeight * lines.length
  }

  // Fila "label ---barra--- %", mismo trazo que LevelBar.tsx (frontend):
  // barra gris con relleno tinta, rojo solo si level < 50.
  function drawLevelRow(
    label: string,
    level: number | null,
    x: number,
    width: number,
    compact: boolean,
  ) {
    const labelColW = compact ? 32 : 42
    const pctColW = 12
    const gap = 3
    const barMaxW = width - labelColW - pctColW - gap * 2
    const barH = compact ? 2.2 : 3
    const isCritical = level != null && level < 50
    const rowFontSize = compact ? 7.5 : 8.5

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(rowFontSize)
    pdf.setTextColor(SLATE_500[0], SLATE_500[1], SLATE_500[2])
    pdf.text(label, x, cursor.y)

    const barX = x + labelColW
    const barY = cursor.y - barH + 0.3
    pdf.setFillColor(TRACK_GRAY[0], TRACK_GRAY[1], TRACK_GRAY[2])
    pdf.rect(barX, barY, barMaxW, barH, 'F')
    const filledW = level != null ? (level / 100) * barMaxW : 0
    drawHorizontalBar(pdf, barX, barY, filledW, barH, isCritical ? BAR_COLOR_CRITICAL : BAR_COLOR)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(rowFontSize)
    const textColor = isCritical ? RED_600 : SLATE_900
    pdf.setTextColor(textColor[0], textColor[1], textColor[2])
    pdf.text(level != null ? `${level.toFixed(1)}%` : '—', barX + barMaxW + gap, cursor.y)
  }

  ensureSpace(16)
  printLine('Dashboard de auditoría — Matafuegos', { size: 15, bold: true, heightMm: 6.5 })
  printLine(formatPeriodLabel(period), { size: 10, color: SLATE_500, heightMm: 8 })

  if (sectors.length === 0) {
    printLine('No hay sectores seleccionados para este informe.', { size: 9.5, color: SLATE_500 })
    pdf.save(`dashboard-auditoria-matafuegos-${period}.pdf`)
    return
  }

  // Por establecimiento → sector
  for (const est of groupByEstablishment(sectors)) {
    ensureSpace(12)
    printLine(est.establishment, { size: 12.5, bold: true, heightMm: 6.5 })

    for (const sector of est.sectors) {
      ensureSpace(8)
      printLine(
        `${sector.locationType} — ${sector.level != null ? sector.level.toFixed(1) + '%' : '—'} (${classifyLevel(sector.level) ?? 'Sin datos'})`,
        { x: marginX + 3, size: 10, bold: true, heightMm: 5.5 },
      )
      printLine(
        `${sector.total} matafuego${sector.total !== 1 ? 's' : ''} · ${sector.audited} auditado${sector.audited !== 1 ? 's' : ''}`,
        { x: marginX + 3, size: 7.5, color: SLATE_500, heightMm: 4.5 },
      )

      if (sector.expiredExtinguishers.length > 0) {
        printLine(`Vencidos: ${formatExtinguisherList(sector.expiredExtinguishers)}`, {
          x: marginX + 3,
          size: 7.5,
          bold: true,
          color: RED_600,
          heightMm: 4.5,
          maxWidth: contentW - 3,
        })
      }
      if (sector.needsCleaningExtinguishers.length > 0) {
        printLine(`Hay que limpiar: ${formatExtinguisherList(sector.needsCleaningExtinguishers)}`, {
          x: marginX + 3,
          size: 7.5,
          bold: true,
          color: AMBER_600,
          heightMm: 4.5,
          maxWidth: contentW - 3,
        })
      }

      const blockX = marginX + 6
      const blockW = contentW - 6
      for (const cp of sector.controlPoints) {
        ensureSpace(4.3)
        drawLevelRow(cp.label, cp.level, blockX, blockW, true)
        cursor.y += 4.3
      }
      cursor.y += 3
    }
    cursor.y += 3
  }

  pdf.save(`dashboard-auditoria-matafuegos-${period}.pdf`)
}
