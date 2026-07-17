// Primitivas de dibujo compartidas por los generadores de PDF nativos
// (buildFindingsReportPdf, buildFireExtinguisherDashboardPdf) — nada de
// html2canvas/capturas de pantalla, todo texto y figuras vectoriales.

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function drawPieSlice(
  pdf: any,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  rgb: [number, number, number],
) {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2])
  const stepDeg = 4
  const toXY = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const points: [number, number][] = [[cx, cy]]
  for (let d = startDeg; d < endDeg; d += stepDeg) points.push(toXY(d))
  points.push(toXY(endDeg))

  const deltas: [number, number][] = []
  for (let i = 1; i < points.length; i++) {
    deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]])
  }
  pdf.lines(deltas, points[0][0], points[0][1], [1, 1], 'F', true)
}

/** Torta rellena — un slice de arco aproximado por segmentos chicos, técnica estándar en jsPDF sin plugins. */
export function drawPieChart(pdf: any, cx: number, cy: number, r: number, segments: { value: number; color: string }[]) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return
  let angle = -90
  for (const seg of segments) {
    if (seg.value <= 0) continue
    const sweep = (seg.value / total) * 360
    drawPieSlice(pdf, cx, cy, r, angle, angle + sweep, hexToRgb(seg.color))
    angle += sweep
  }
}

/** Barra horizontal rellena — para gráficos de barras dibujados a mano. */
export function drawHorizontalBar(pdf: any, x: number, y: number, widthMm: number, heightMm: number, color: string) {
  const [r, g, b] = hexToRgb(color)
  pdf.setFillColor(r, g, b)
  pdf.rect(x, y, Math.max(widthMm, 0.4), heightMm, 'F')
}
