// Intérprete mínimo del `where` de Prisma para tests de integración con base
// simulada: evalúa el where REAL que arma un servicio sobre registros en
// memoria, así el test compara importes en vez de la forma del filtro.
// Soporta solo los operadores que usan los filtros de pólizas (AND/OR,
// null, in/lt/lte/gt/gte/not/equals, some/none/is y relaciones 1-a-1). Un
// operador no soportado falla explícitamente en vez de dar un falso positivo.

type Where = Record<string, unknown>
const SCALAR_OPERATORS = new Set(['in', 'lt', 'lte', 'gt', 'gte', 'not', 'equals'])
const toComparable = (v: unknown) => (v instanceof Date ? v.getTime() : v)

function matchesScalar(value: unknown, condition: Record<string, unknown>): boolean {
  return Object.entries(condition).every(([op, operand]) => {
    const v = toComparable(value)
    const o = toComparable(operand)
    switch (op) {
      case 'in': return (operand as unknown[]).includes(value)
      case 'lt': return value != null && (v as number) < (o as number)
      case 'lte': return value != null && (v as number) <= (o as number)
      case 'gt': return value != null && (v as number) > (o as number)
      case 'gte': return value != null && (v as number) >= (o as number)
      case 'equals': return v === o
      case 'not': return operand === null ? value != null : v !== o
      default: throw new Error(`operador no soportado: ${op}`)
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function matchesWhere(record: any, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true
    if (key === 'AND') return (Array.isArray(condition) ? condition : [condition]).every((w) => matchesWhere(record, w as Where))
    if (key === 'OR') return (condition as Where[]).some((w) => matchesWhere(record, w))
    const value = record[key]
    if (condition === null) return value == null
    if (typeof condition !== 'object' || condition instanceof Date) return toComparable(value) === toComparable(condition)
    const c = condition as Where
    if ('some' in c) return ((value ?? []) as unknown[]).some((item) => matchesWhere(item, c.some as Where))
    if ('none' in c) return !((value ?? []) as unknown[]).some((item) => matchesWhere(item, c.none as Where))
    if ('is' in c) return value != null && matchesWhere(value, c.is as Where)
    if (Object.keys(c).every((k) => SCALAR_OPERATORS.has(k))) return matchesScalar(value, c)
    return value != null && matchesWhere(value, c) // relación 1-a-1 sin `is` (ej. `policy`)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

/** groupBy simulado: filtra con el where y suma los campos de `_sum` por las claves de `by`. */
export function simulateGroupBy(rows: Row[], args: { by: string[]; where?: Where; _sum: Record<string, boolean> }) {
  const groups = new Map<string, Row>()
  for (const row of rows.filter((r) => matchesWhere(r, args.where))) {
    const key = JSON.stringify(args.by.map((k) => row[k] ?? null))
    const group = groups.get(key) ?? { ...Object.fromEntries(args.by.map((k) => [k, row[k] ?? null])), _sum: Object.fromEntries(Object.keys(args._sum).map((f) => [f, 0])) }
    for (const field of Object.keys(args._sum)) group._sum[field] += row[field] ?? 0
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** findMany simulado con `select` de campos escalares. */
export function simulateFindMany(rows: Row[], args: { where?: Where; select: Record<string, boolean> }) {
  return rows
    .filter((r) => matchesWhere(r, args.where))
    .map((r) => Object.fromEntries(Object.keys(args.select).map((k) => [k, r[k]])))
}
