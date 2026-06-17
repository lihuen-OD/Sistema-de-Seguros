// ─── CSV ─────────────────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadCSV(rows: string[][], filename: string): void {
  const content = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n')
  // UTF-8 BOM so Excel opens with correct encoding
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── PDF (print window) ───────────────────────────────────────────────────────

export interface PrintColumn {
  label: string
  align?: 'left' | 'right'
}

export interface PrintRow {
  cells: string[]
  isTotal?: boolean
  isDim?: boolean
}

export function printTableAsPDF(
  title: string,
  subtitle: string,
  columns: PrintColumn[],
  rows: PrintRow[],
): void {
  const thCells = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? 'right'};padding:4px 7px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#475569;white-space:nowrap">${c.label}</th>`,
    )
    .join('')

  const trRows = rows
    .map((row) => {
      const bg = row.isTotal
        ? 'background:#f1f5f9;border-top:2px solid #cbd5e1;font-weight:700;'
        : row.isDim
        ? 'opacity:0.45;'
        : ''
      const tds = row.cells
        .map(
          (cell, i) =>
            `<td style="text-align:${columns[i]?.align ?? 'right'};padding:3px 7px;border:1px solid #e2e8f0;font-size:8.5px;white-space:nowrap">${cell}</td>`,
        )
        .join('')
      return `<tr style="${bg}">${tds}</tr>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;color:#1e293b;padding:18px}
  h1{font-size:13px;font-weight:700;margin-bottom:3px}
  p.sub{font-size:9px;color:#64748b;margin-bottom:14px}
  table{border-collapse:collapse;width:100%}
  @page{size:landscape;margin:1.5cm}
  @media print{body{padding:0}}
</style>
</head>
<body>
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
<table>
  <thead><tr>${thCells}</tr></thead>
  <tbody>${trRows}</tbody>
</table>
</body>
</html>`

  const w = window.open('', '_blank', 'width=1200,height=800')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.addEventListener('load', () => w.print())
}

// ─── ISO week helpers ─────────────────────────────────────────────────────────

/** Returns ISO week key "YYYY-Www" for a YYYY-MM-DD date string. */
export function getISOWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() || 7 // Mon=1 … Sun=7
  const thursday = new Date(date)
  thursday.setDate(date.getDate() + 4 - dow)
  const yearStart = new Date(thursday.getFullYear(), 0, 4) // Jan 4 is always in W1
  const w1Monday = new Date(yearStart)
  w1Monday.setDate(yearStart.getDate() - (yearStart.getDay() || 7) + 1)
  const weekNo =
    Math.round((thursday.getTime() - w1Monday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  return `${thursday.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** Generates all ISO weeks whose Monday falls within the from–to month range. */
export function generateWeekRange(
  from: string,
  to: string,
): { key: string; label: string }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const endDate = new Date(ty, tm, 0) // last day of to-month

  const cur = new Date(fy, fm - 1, 1) // first day of from-month
  // rewind to the Monday of that week
  const dow = cur.getDay() || 7
  cur.setDate(cur.getDate() - dow + 1)

  const result: { key: string; label: string }[] = []
  while (cur <= endDate && result.length < 130) {
    const isoStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const key = getISOWeekKey(isoStr)
    const label = `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}`
    result.push({ key, label })
    cur.setDate(cur.getDate() + 7)
  }
  return result
}
