/**
 * Empaqueta alturas (en mm) en páginas sin nunca partir un elemento a la
 * mitad — agrega el siguiente a la página actual mientras entre; si no
 * entra, cierra la página y arranca una nueva con ese elemento. Un elemento
 * más alto que una página entera queda solo en su propia página (se corta
 * como último recurso al momento de dibujarlo, no acá).
 *
 * La usa `printTableAsPDF` para empaquetar filas de tabla en páginas sin
 * cortar ninguna a la mitad.
 */
export function packIntoPages(heightsMm: number[], pageHeightMm: number): number[][] {
  const pages: number[][] = []
  let current: number[] = []
  let currentHeight = 0

  heightsMm.forEach((height, index) => {
    if (current.length > 0 && currentHeight + height > pageHeightMm) {
      pages.push(current)
      current = []
      currentHeight = 0
    }
    current.push(index)
    currentHeight += height
  })
  if (current.length > 0) pages.push(current)

  return pages
}
