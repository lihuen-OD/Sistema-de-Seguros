// `rows` tiene que venir ordenado más-reciente-primero (orderBy createdAt
// desc en la query de origen) — esta función solo se queda con la primera
// fila que ve por cada clave. No usar `auditDate` como criterio de orden acá:
// es una fecha calendario ("hoy"), no un timestamp, y dos filas del mismo
// ítem+período (una vieja y su recorrección) empatan ahí casi siempre.
export function latestByKey<T>(rows: T[], keyOf: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const key = keyOf(row)
    if (!map.has(key)) map.set(key, row)
  }
  return map
}
