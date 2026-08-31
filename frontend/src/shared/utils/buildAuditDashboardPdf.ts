import type { AuditDashboardSector, AuditFlaggedExtinguisher } from '../api/fire-extinguisher-audits.api'
import { formatPeriodLabel } from '../../modules/fire-extinguishers/audits/findingsReportFields'
import { drawHorizontalBar, hexToRgb } from './pdfShapes'
import { classifyLevel } from './auditLevel'

// PDF armado a mano con las primitivas de jsPDF (texto y figuras) — nada de
// html2canvas/capturas de pantalla. Mismo estilo que ve la pantalla "Informe
// de auditoría" para el detalle por sector: nivel % + barra por punto de
// control. A diferencia de la pantalla, el PDF no incluye el resumen global
// ("Nivel general" / "Nivel por punto de control") — solo tiene sentido en
// pantalla como vista ejecutiva, no en la hoja que se le manda a la persona
// que limpia/recarga matafuegos. Solo incluye los sectores recibidos (los
// tildados en pantalla). Cada sector se dibuja como una card (mismo radio/
// borde que `.card` en pantalla) que agrupa hasta 3 cards internas por
// urgencia — Vencidos / Requieren limpieza / Sugiere limpieza — antes de las
// barras por punto de control, así la persona que limpia/recarga sabe qué
// priorizar en vez de una sola lista mezclada.

const TRACK_GRAY: [number, number, number] = [243, 244, 246]
const SLATE_900: [number, number, number] = [15, 23, 42]
const SLATE_700: [number, number, number] = [51, 65, 85]
const SLATE_500: [number, number, number] = [100, 116, 139]
const RED_600: [number, number, number] = [220, 38, 38]
const AMBER_600: [number, number, number] = [217, 119, 6]
const BAR_COLOR = '#334155' // slate-700
const BAR_COLOR_CRITICAL = '#ef4444' // red-500

// Cards internas por urgencia — mismo par fill/border que ya usan Badge.tsx/
// StatusPill.tsx (bg-*-50/100, border-*-200/300) para no inventar una
// paleta nueva. Orden de aparición = orden de urgencia.
const EXPIRED_FILL = '#fef2f2' // red-50
const EXPIRED_BORDER = '#fecaca' // red-200
const AMBER_FILL = '#fffbeb' // amber-50
const AMBER_BORDER = '#fde68a' // amber-200
const SLATE_FILL = '#f1f5f9' // slate-100
const SLATE_BORDER = '#cbd5e1' // slate-300
const CARD_BORDER = '#e2e8f0' // slate-200 — mismo tono que border-slate-200 de `.card`
const ESTABLISHMENT_RULE_COLOR = '#e2e8f0' // slate-200

// Muy sucio/suciedad acumulada → "Requieren limpieza" (ámbar, más urgente).
// Polvo leve/suciedad visible → "Sugiere limpieza" (gris, menos urgente).
const HEAVY_DIRT_CLEANLINESS = ['MUY_SUCIO', 'SUCIEDAD_ACUMULADA']
const LIGHT_DIRT_CLEANLINESS = ['LEVE_POLVO', 'SUCIEDAD_VISIBLE']

// Mismos 4 cortes que auditLevel.ts (Crítico/Regular/Bueno/Óptimo), con los
// mismos pares fill/border/text que ya usan Badge.tsx (danger/warning/
// primary/success) — el badge de % del sector no inventa colores nuevos.
const LEVEL_BADGE_STYLES: Record<string, { fill: string; border: string; text: [number, number, number] }> = {
  'Crítico': { fill: '#fef2f2', border: '#fecaca', text: [185, 28, 28] },
  'Regular': { fill: '#fffbeb', border: '#fde68a', text: [180, 83, 9] },
  'Bueno': { fill: '#f4fbf5', border: '#c8e5ca', text: [31, 65, 34] },
  'Óptimo': { fill: '#ecfdf5', border: '#a7f3d0', text: [4, 120, 87] },
}
const LEVEL_BADGE_FALLBACK = { fill: '#f1f5f9', border: '#e2e8f0', text: SLATE_500 }

// Escala de espaciado del documento — 3 pasos, cada uno el doble del
// anterior, para que la jerarquía se note en el espaciado y no solo en
// negrita/tamaño de letra (principio de proximidad: lo que está más cerca se
// lee como "del mismo grupo"). Reusados tanto para medir el alto de la card
// antes de dibujarla como para imprimir el contenido real — un solo lugar,
// sin duplicar los números en dos fórmulas que puedan desalinearse.
const GAP_TIGHT = 3 // entre elementos "hermanos" del mismo grupo (ej. una card de urgencia y la siguiente)
const GAP_SECTION = 6 // entre secciones distintas dentro de la misma card, o entre cards de sector
const GAP_GROUP = 9 // entre grupos grandes (establecimiento → establecimiento)

const CARD_PAD_X = 5
const CARD_PAD_Y = 4
const SECTOR_HEADER_ROW_H = 6.5
// Aire fijo después del encabezado del sector, haya o no cards de urgencia
// debajo — así el salto "título → primer contenido" es siempre el mismo,
// en vez de depender de qué venga después.
const HEADER_GAP = 2
const CONTROL_POINT_ROW_H = 4.3
const FLAG_CARD_GAP_AFTER = GAP_TIGHT
// Gap después de la ÚLTIMA card de urgencia — más grande que el gap entre
// cards de urgencia entre sí (FLAG_CARD_GAP_AFTER), para que el corte hacia
// las barras de punto de control se sienta como un cambio de sección y no
// como una card más de la lista.
const FLAG_SECTION_GAP_AFTER = GAP_SECTION
const SECTOR_CARD_GAP_AFTER = GAP_SECTION
const ESTABLISHMENT_HEADER_GAP = GAP_TIGHT
// Gap total entre la última card de un establecimiento y el título del
// próximo — más grande que el gap entre cards del mismo establecimiento
// (SECTOR_CARD_GAP_AFTER), para que la jerarquía establecimiento > sector
// se note en el espaciado, no solo en el tamaño de letra.
const ESTABLISHMENT_GAP_AFTER = GAP_GROUP

// Identifica el matafuego por "Detalle de ubicación" (el nombre puntual que
// la persona reconoce en el campo, ej. "Portón norte") — es un campo
// opcional, así que si no está cargado se cae al número de cilindro (y el
// backend a su vez cae al código interno si tampoco hay número de cilindro).
function formatExtinguisherList(items: AuditFlaggedExtinguisher[]): string {
  return items.map((i) => i.location ?? i.cylinderNumber).join(', ')
}

interface FlagGroup {
  label: string
  items: AuditFlaggedExtinguisher[]
  fill: string
  border: string
  text: [number, number, number]
}

// Las hasta 3 cards de urgencia de un sector, en orden decreciente de
// prioridad — Vencidos primero (ya no puede evitarse, hay que reponer),
// después "Requieren limpieza" (muy sucio/suciedad acumulada) y por último
// "Sugiere limpieza" (polvo leve/suciedad visible). Un solo lugar arma esta
// lista — tanto la medición previa del alto de la card como el dibujo real
// iteran sobre el mismo array, así no hay dos criterios de armado que se
// puedan desalinear.
function buildFlagGroups(sector: AuditDashboardSector): FlagGroup[] {
  const groups: FlagGroup[] = []
  if (sector.expiredExtinguishers.length > 0) {
    groups.push({ label: 'Vencidos', items: sector.expiredExtinguishers, fill: EXPIRED_FILL, border: EXPIRED_BORDER, text: RED_600 })
  }
  const heavyDirt = sector.needsCleaningExtinguishers.filter((i) => i.cleanliness != null && HEAVY_DIRT_CLEANLINESS.includes(i.cleanliness))
  if (heavyDirt.length > 0) {
    groups.push({ label: 'Requieren limpieza', items: heavyDirt, fill: AMBER_FILL, border: AMBER_BORDER, text: AMBER_600 })
  }
  const lightDirt = sector.needsCleaningExtinguishers.filter((i) => i.cleanliness != null && LIGHT_DIRT_CLEANLINESS.includes(i.cleanliness))
  if (lightDirt.length > 0) {
    groups.push({ label: 'Sugiere limpieza', items: lightDirt, fill: SLATE_FILL, border: SLATE_BORDER, text: SLATE_700 })
  }
  return groups
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

  function drawDivider(x: number, width: number, color: string) {
    const [r, g, b] = hexToRgb(color)
    pdf.setDrawColor(r, g, b)
    pdf.setLineWidth(0.25)
    pdf.line(x, cursor.y, x + width, cursor.y)
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

  // Badge en forma de píldora para el % del sector — mismos 4 colores que ya
  // usa classifyLevel/Badge.tsx en pantalla, en vez del texto plano
  // "(Crítico)". Radio = mitad del alto → misma forma que rounded-full de
  // StatusPill.tsx.
  function drawLevelBadge(level: number | null, rightEdgeX: number, baselineY: number) {
    const label = classifyLevel(level)
    const text = level != null ? `${level.toFixed(1)}% · ${label}` : 'Sin datos'
    const style = (label != null ? LEVEL_BADGE_STYLES[label] : undefined) ?? LEVEL_BADGE_FALLBACK
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.5)
    const textW = pdf.getTextWidth(text)
    const padX = 2.6
    const badgeH = 5.4
    const badgeW = textW + padX * 2
    const badgeX = rightEdgeX - badgeW
    const badgeY = baselineY - badgeH + 1.5

    const [fr, fg, fb] = hexToRgb(style.fill)
    const [br, bg, bb] = hexToRgb(style.border)
    pdf.setFillColor(fr, fg, fb)
    pdf.setDrawColor(br, bg, bb)
    pdf.setLineWidth(0.25)
    pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeH / 2, 'FD')

    pdf.setTextColor(style.text[0], style.text[1], style.text[2])
    pdf.text(text, badgeX + padX, baselineY)
  }

  // Título del sector + cantidad de matafuegos en la misma línea (en vez de
  // una línea aparte con "N matafuegos · N auditados") — el dato de
  // auditados ya no aporta nada nuevo acá (la card entera es de sectores
  // seleccionados porque ya se auditaron) y una sola línea de encabezado deja
  // la card más compacta.
  function printSectorHeaderRow(sector: AuditDashboardSector, x: number, width: number) {
    ensureSpace(SECTOR_HEADER_ROW_H)
    const baselineY = cursor.y + 3.6
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10.5)
    pdf.setTextColor(SLATE_900[0], SLATE_900[1], SLATE_900[2])
    pdf.text(sector.locationType, x, baselineY)
    const titleW = pdf.getTextWidth(sector.locationType)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.setTextColor(SLATE_500[0], SLATE_500[1], SLATE_500[2])
    pdf.text(`${sector.total} matafuego${sector.total !== 1 ? 's' : ''}`, x + titleW + 3, baselineY)

    drawLevelBadge(sector.level, x + width, baselineY)
    cursor.y += SECTOR_HEADER_ROW_H
  }

  // Métricas de la card interna (fill+borde) de un grupo de urgencia —
  // calculadas una sola vez y reusadas tanto para medir el alto total del
  // sector antes de dibujarlo como para dibujar la card en sí, así no hay
  // dos fórmulas de alto que puedan desalinearse.
  function flagCardMetrics(items: AuditFlaggedExtinguisher[], width: number) {
    const padX = 3
    const padTopY = 3.2
    const padBottomY = 2.4
    const labelH = 4.2
    const bodyH = 3.7
    const innerW = width - padX * 2
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.3)
    const bodyLines = pdf.splitTextToSize(formatExtinguisherList(items), innerW) as string[]
    const contentH = labelH + bodyLines.length * bodyH
    return { padX, padTopY, padBottomY, labelH, bodyH, innerW, boxH: padTopY + contentH + padBottomY }
  }

  function drawFlagCard(group: FlagGroup, x: number, width: number, gapAfter: number) {
    const m = flagCardMetrics(group.items, width)
    ensureSpace(m.boxH + gapAfter)
    // `boxTop` es directamente cursor.y (no se le resta el padding superior)
    // — así el gap que dejó el elemento anterior queda intacto como espacio
    // en blanco real, en vez de "prestárselo" a esta card y terminar
    // pegadas. El padding se aplica sumando hacia abajo, nunca restando.
    const boxTop = cursor.y

    const [fr, fg, fb] = hexToRgb(group.fill)
    const [br, bg, bb] = hexToRgb(group.border)
    pdf.setFillColor(fr, fg, fb)
    pdf.setDrawColor(br, bg, bb)
    pdf.setLineWidth(0.25)
    pdf.roundedRect(x, boxTop, width, m.boxH, 2, 2, 'FD')

    cursor.y = boxTop + m.padTopY
    printLine(group.label, { x: x + m.padX, size: 8, bold: true, color: group.text, heightMm: m.labelH })
    printLine(formatExtinguisherList(group.items), {
      x: x + m.padX,
      size: 7.3,
      color: group.text,
      heightMm: m.bodyH,
      maxWidth: m.innerW,
    })

    cursor.y = boxTop + m.boxH + gapAfter
  }

  // Gap después de cada card de urgencia — GAP_TIGHT entre una y la
  // siguiente (son "hermanas"), pero GAP_SECTION después de la última, para
  // que el salto hacia las barras de punto de control se sienta como un
  // cambio de sección real y no como una card más de la lista.
  function flagCardGapAfter(index: number, total: number): number {
    return index === total - 1 ? FLAG_SECTION_GAP_AFTER : FLAG_CARD_GAP_AFTER
  }

  // Alto total estimado de la card del sector — se usa para reservar el
  // espacio de una sola vez antes de empezar a dibujar, evitando que un
  // salto de página parta la card grande a la mitad.
  function estimateSectorHeight(sector: AuditDashboardSector, innerW: number): number {
    let h = CARD_PAD_Y + SECTOR_HEADER_ROW_H + HEADER_GAP

    const flagGroups = buildFlagGroups(sector)
    flagGroups.forEach((g, i) => {
      h += flagCardMetrics(g.items, innerW).boxH + flagCardGapAfter(i, flagGroups.length)
    })

    h += sector.controlPoints.length * CONTROL_POINT_ROW_H
    h += CARD_PAD_Y
    return h
  }

  ensureSpace(16)
  printLine('Dashboard de auditoría — Matafuegos', { size: 15, bold: true, heightMm: 6.5 })
  printLine(formatPeriodLabel(period), { size: 10, color: SLATE_500, heightMm: 8 })

  if (sectors.length === 0) {
    printLine('No hay sectores seleccionados para este informe.', { size: 9.5, color: SLATE_500 })
    pdf.save(`dashboard-auditoria-matafuegos-${period}.pdf`)
    return
  }

  // Por establecimiento → sector, cada sector como su propia card.
  for (const est of groupByEstablishment(sectors)) {
    ensureSpace(14)
    printLine(est.establishment, { size: 12.5, bold: true, heightMm: 6.5 })
    drawDivider(marginX, contentW, ESTABLISHMENT_RULE_COLOR)
    cursor.y += ESTABLISHMENT_HEADER_GAP

    for (const sector of est.sectors) {
      const cardX = marginX
      const cardW = contentW
      const innerX = cardX + CARD_PAD_X
      const innerW = cardW - CARD_PAD_X * 2

      ensureSpace(estimateSectorHeight(sector, innerW))
      const pageBefore = pdf.getNumberOfPages()
      const cardStartY = cursor.y

      cursor.y += CARD_PAD_Y
      printSectorHeaderRow(sector, innerX, innerW)
      cursor.y += HEADER_GAP

      const flagGroups = buildFlagGroups(sector)
      flagGroups.forEach((group, i) => {
        drawFlagCard(group, innerX, innerW, flagCardGapAfter(i, flagGroups.length))
      })

      for (const cp of sector.controlPoints) {
        ensureSpace(CONTROL_POINT_ROW_H)
        drawLevelRow(cp.label, cp.level, innerX, innerW, true)
        cursor.y += CONTROL_POINT_ROW_H
      }

      cursor.y += CARD_PAD_Y

      // Si no hubo salto de página en el medio, el rectángulo de principio a
      // fin de la card cae en la misma página y se puede trazar el borde.
      // Si hubo salto (sector inusualmente largo), se omite el borde en vez
      // de dibujar un rectángulo con coordenadas de dos páginas distintas.
      if (pdf.getNumberOfPages() === pageBefore) {
        const [br, bg, bb] = hexToRgb(CARD_BORDER)
        pdf.setDrawColor(br, bg, bb)
        pdf.setLineWidth(0.3)
        pdf.roundedRect(cardX, cardStartY, cardW, cursor.y - cardStartY, 2.6, 2.6, 'S')
      }

      cursor.y += SECTOR_CARD_GAP_AFTER
    }
    cursor.y += ESTABLISHMENT_GAP_AFTER - SECTOR_CARD_GAP_AFTER
  }

  pdf.save(`dashboard-auditoria-matafuegos-${period}.pdf`)
}
