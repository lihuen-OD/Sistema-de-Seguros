import { prisma } from '../../config/database'

// Fila placeholder que sembró la migración
// 20260727154836_add_exchange_rate_and_dual_currency_amounts (rate 1000,
// updatedBy 'sistema (seed inicial — actualizar)'). Es un valor de ejemplo,
// no una cotización real: mientras siga siendo la fila más reciente, ningún
// cálculo que necesite el TC actual (ej. la proyección de renovaciones en
// ARS) debe usarlo como si fuera confiable.
export const SEED_EXCHANGE_RATE_ID = 'a0000000-0000-4000-8000-000000000001'

export const exchangeRateService = {
  // "Actual" = la fila más reciente del log append-only. Si todavía no se
  // configuró ninguna, devuelve rate null — el frontend lo muestra como "sin
  // configurar" en vez de inventar un número. `isPlaceholder` avisa que la
  // fila vigente es todavía la semilla de la migración (nunca se actualizó).
  async getCurrent() {
    const latest = await prisma.exchangeRateLog.findFirst({ orderBy: { createdAt: 'desc' } })
    if (!latest) return { rate: null, updatedBy: null, updatedAt: null, isPlaceholder: false }
    return {
      rate: latest.rate,
      updatedBy: latest.updatedBy,
      updatedAt: latest.createdAt,
      isPlaceholder: latest.id === SEED_EXCHANGE_RATE_ID,
    }
  },

  setCurrent(rate: number, updatedBy?: string) {
    return prisma.exchangeRateLog.create({ data: { rate, updatedBy: updatedBy ?? null } })
  },

  getHistory(limit = 20) {
    return prisma.exchangeRateLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
  },
}
