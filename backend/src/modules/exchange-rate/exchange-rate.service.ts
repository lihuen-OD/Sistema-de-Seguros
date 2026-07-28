import { prisma } from '../../config/database'

export const exchangeRateService = {
  // "Actual" = la fila más reciente del log append-only. Si todavía no se
  // configuró ninguna, devuelve rate null — el frontend lo muestra como "sin
  // configurar" en vez de inventar un número.
  async getCurrent() {
    const latest = await prisma.exchangeRateLog.findFirst({ orderBy: { createdAt: 'desc' } })
    if (!latest) return { rate: null, updatedBy: null, updatedAt: null }
    return { rate: latest.rate, updatedBy: latest.updatedBy, updatedAt: latest.createdAt }
  },

  setCurrent(rate: number, updatedBy?: string) {
    return prisma.exchangeRateLog.create({ data: { rate, updatedBy: updatedBy ?? null } })
  },

  getHistory(limit = 20) {
    return prisma.exchangeRateLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
  },
}
