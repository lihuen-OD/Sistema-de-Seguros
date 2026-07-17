import type { TableColumn } from '../types'
import { packIntoPages } from './pdfPagination'

// ─── Excel (.xlsx) ────────────────────────────────────────────────────────────

// xlsx pesa ~400-500KB — se carga dinámicamente recién al exportar, no en el
// chunk inicial de cada página de listado que usa ExportPresetsButton.
export async function downloadXLSX(rows: string[][], filename: string): Promise<void> {
  if (rows.length === 0) return
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Auto column widths capped at 60 chars
  ws['!cols'] = rows[0].map((_, colIdx) => ({
    wch: Math.min(60, Math.max(...rows.map((row) => String(row[colIdx] ?? '').length), 8)),
  }))

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, filename)
}

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

export function buildExportRows<T>(rows: T[], columns: TableColumn<T>[]): string[][] {
  const exportCols = columns.filter((c) => c.hideable !== false)
  const header = exportCols.map((c) => c.label)
  const body = rows.map((row) =>
    exportCols.map((col) => {
      if (col.exportValue) return col.exportValue(row)
      const v = row[col.key as keyof T]
      return v != null ? String(v) : ''
    }),
  )
  return [header, ...body]
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

export async function printTableAsPDF(
  title: string,
  subtitle: string,
  columns: PrintColumn[],
  rows: PrintRow[],
): Promise<void> {
  const [html2canvasModule, jsPDFModule] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const html2canvas = html2canvasModule.default
  const jsPDF = jsPDFModule.default

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

  const container = document.createElement('div')
  // position:absolute + visibility:hidden so the element lays out at its natural width
  // without being clipped to the viewport (position:fixed would constrain to viewport width,
  // breaking wide tables with many time-period columns).
  container.style.cssText = 'visibility:hidden;position:absolute;top:0;left:0;background:#ffffff;padding:24px;font-family:Helvetica Neue,Arial,sans-serif;color:#1e293b;'
  container.innerHTML = `
    <div data-pdf-header>
      <h1 style="font-size:14px;font-weight:700;margin:0 0 4px">${title}</h1>
      <p style="font-size:9px;color:#64748b;margin:0 0 16px">${subtitle}</p>
    </div>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${trRows}</tbody>
    </table>`

  document.body.appendChild(container)

  try {
    // After the browser lays out the element, read its natural width (may be wider than viewport).
    const renderWidth = Math.max(container.scrollWidth, 900)
    container.style.width = renderWidth + 'px'

    const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const mmPerCssPx = pageW / renderWidth

    // Se repiten en cada página (nunca se ocultan) — título/subtítulo + encabezados de columna.
    const headerBlock = container.querySelector<HTMLElement>('[data-pdf-header]')
    const thead = container.querySelector<HTMLElement>('thead')
    const headerHeightMm = ((headerBlock?.offsetHeight ?? 0) + (thead?.offsetHeight ?? 0)) * mmPerCssPx
    const availablePerPage = Math.max(pageH - headerHeightMm, pageH * 0.5)

    const trEls = Array.from(container.querySelectorAll<HTMLElement>('tbody tr'))
    const rowHeightsMm = trEls.map((tr) => tr.offsetHeight * mmPerCssPx)
    const pages = trEls.length > 0 ? packIntoPages(rowHeightsMm, availablePerPage) : [[]]

    const captureContainer = async () => {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: renderWidth,
      })
      const mmPerPx = pageW / canvas.width
      const imgHmm = canvas.height * mmPerPx
      return { imgData: canvas.toDataURL('image/jpeg', 0.92), imgHmm }
    }

    for (let p = 0; p < pages.length; p++) {
      const rowIndexesOnPage = new Set(pages[p])
      trEls.forEach((tr, i) => {
        tr.style.display = rowIndexesOnPage.has(i) ? '' : 'none'
      })

      const { imgData, imgHmm } = await captureContainer()
      if (p > 0) pdf.addPage()

      if (imgHmm <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgHmm)
      } else {
        // Última página con más contenido del que entra en una hoja (caso
        // extremo, ej. una sola fila gigantesca) — se corta como último recurso.
        let yOffset = 0
        while (yOffset < imgHmm) {
          pdf.addImage(imgData, 'JPEG', 0, -yOffset, pageW, imgHmm)
          yOffset += pageH
          if (yOffset < imgHmm) pdf.addPage()
        }
      }
    }

    const date = new Date().toISOString().slice(0, 10)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    pdf.save(`${slug}-${date}.pdf`)
  } finally {
    if (document.body.contains(container)) document.body.removeChild(container)
  }
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
