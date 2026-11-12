import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import ExcelJS from 'exceljs'
import { downloadXLSX } from '../../src/shared/utils/export'

// downloadXLSX con la opción aditiva sheetName/extraSheets: las llamadas
// existentes (sin esas opciones) siguen generando UNA hoja «Datos»; con
// extraSheets se agregan hojas en orden, cada una con su formato.

async function capture(run: () => Promise<void>): Promise<ExcelJS.Workbook> {
  const dom = new JSDOM('<!doctype html><body></body>')
  const g = globalThis as unknown as Record<string, unknown>
  const prevDocument = g.document
  let blob: Blob | null = null
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL
  g.document = dom.window.document
  URL.createObjectURL = ((b: Blob) => { blob = b; return 'blob:test' }) as typeof URL.createObjectURL
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL
  try {
    await run()
  } finally {
    g.document = prevDocument
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
  }
  assert.ok(blob, 'se generó el archivo')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await (blob as Blob).arrayBuffer())
  return wb
}

test('sin opciones nuevas: una sola hoja «Datos» (comportamiento previo)', async () => {
  const wb = await capture(() => downloadXLSX([['A', 'B'], ['x', 1]], 'a.xlsx', { numericColumnIndexes: [1] }))
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Datos'])
  assert.equal(wb.worksheets[0].getCell('B2').value, 1)
})

test('con sheetName + extraSheets: hojas en orden, totales y formato por hoja', async () => {
  const wb = await capture(() =>
    downloadXLSX([['Mes', 'USD'], ['ENE 26', 10], ['Total', 10]], 'b.xlsx', {
      sheetName: 'Presupuesto vs real',
      numericColumnIndexes: [1],
      totalRowIndexes: [2],
      extraSheets: [
        { name: 'Fondos (no es costo)', rows: [['Mes', 'Diferencia de fondos'], ['ENE 26', -5]], options: { numericColumnIndexes: [1] } },
        { name: 'Vacía', rows: [] },
        { name: 'Filtros y observaciones', rows: [['Concepto', 'Detalle'], ['Nivel', 'Empresa']] },
      ],
    }),
  )
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Presupuesto vs real', 'Fondos (no es costo)', 'Filtros y observaciones'])
  const main = wb.getWorksheet('Presupuesto vs real')!
  assert.equal(main.getRow(3).font?.bold, true, 'la fila total (índice 2 = fila 3 de Excel) va en negrita')
  assert.equal(wb.getWorksheet('Fondos (no es costo)')!.getCell('B2').value, -5)
  assert.equal(wb.getWorksheet('Filtros y observaciones')!.getCell('B2').value, 'Empresa')
})
