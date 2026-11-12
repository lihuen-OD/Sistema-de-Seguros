// Observaciones de datos agrupadas por categoría (panel compacto
// shared/components/feedback/ObservationsPanel). Las arman las pantallas de
// Proyección de Renovaciones y de Presupuestos; solo PRESENTAN lo que ya
// calcularon sus filas — no recalculan ni corrigen nada.
// - 'review': algo en los datos que el usuario tiene que revisar.
// - 'info': comportamiento esperado que conviene conocer (no es un error).

export type ObservationSeverity = 'review' | 'info'

export interface ObservationDetail {
  /** Activo/fila afectada (null = observación general, sin entidad puntual). */
  assetName: string | null
  /** Comprobantes, fechas, meses e importes detrás del aviso. */
  text: string
}

export interface ObservationCategory {
  key: string
  severity: ObservationSeverity
  title: string
  /** Cantidad de casos (activos, celdas o registros según `countUnit`). */
  count: number
  countUnit: string
  /** Qué significa y qué hacer — una sola vez por categoría. */
  description: string
  details: ObservationDetail[]
}
