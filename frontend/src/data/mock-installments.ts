import type { Installment } from '../shared/types'

export const mockInstallments: Installment[] = [
  // doc-1: 1 cuota pagada
  { id: 'inst-1-1', accountingDocumentId: 'doc-1', installmentNumber: 1, dueDate: '2025-10-01', amount: 1071000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-09-30' },

  // doc-2: 1 cuota pagada
  { id: 'inst-2-1', accountingDocumentId: 'doc-2', installmentNumber: 1, dueDate: '2025-10-01', amount: 963900, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-09-30' },

  // doc-3: 6 cuotas mensuales, parcialmente pagadas
  { id: 'inst-3-1', accountingDocumentId: 'doc-3', installmentNumber: 1, dueDate: '2025-11-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-10-31' },
  { id: 'inst-3-2', accountingDocumentId: 'doc-3', installmentNumber: 2, dueDate: '2025-12-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-11-30' },
  { id: 'inst-3-3', accountingDocumentId: 'doc-3', installmentNumber: 3, dueDate: '2026-01-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-3-4', accountingDocumentId: 'doc-3', installmentNumber: 4, dueDate: '2026-02-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-3-5', accountingDocumentId: 'doc-3', installmentNumber: 5, dueDate: '2026-03-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-3-6', accountingDocumentId: 'doc-3', installmentNumber: 6, dueDate: '2026-04-01', amount: 1008000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-4: 12 cuotas, parcialmente pagadas
  { id: 'inst-4-1', accountingDocumentId: 'doc-4', installmentNumber: 1, dueDate: '2025-11-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-10-31' },
  { id: 'inst-4-2', accountingDocumentId: 'doc-4', installmentNumber: 2, dueDate: '2025-12-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-11-30' },
  { id: 'inst-4-3', accountingDocumentId: 'doc-4', installmentNumber: 3, dueDate: '2026-01-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-4-4', accountingDocumentId: 'doc-4', installmentNumber: 4, dueDate: '2026-02-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-01-31' },
  { id: 'inst-4-5', accountingDocumentId: 'doc-4', installmentNumber: 5, dueDate: '2026-03-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-6', accountingDocumentId: 'doc-4', installmentNumber: 6, dueDate: '2026-04-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-7', accountingDocumentId: 'doc-4', installmentNumber: 7, dueDate: '2026-05-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-8', accountingDocumentId: 'doc-4', installmentNumber: 8, dueDate: '2026-06-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-9', accountingDocumentId: 'doc-4', installmentNumber: 9, dueDate: '2026-07-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-10', accountingDocumentId: 'doc-4', installmentNumber: 10, dueDate: '2026-08-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-11', accountingDocumentId: 'doc-4', installmentNumber: 11, dueDate: '2026-09-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-4-12', accountingDocumentId: 'doc-4', installmentNumber: 12, dueDate: '2026-10-01', amount: 1176000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-5: 3 cuotas pagadas
  { id: 'inst-5-1', accountingDocumentId: 'doc-5', installmentNumber: 1, dueDate: '2025-12-01', amount: 1092000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-11-30' },
  { id: 'inst-5-2', accountingDocumentId: 'doc-5', installmentNumber: 2, dueDate: '2026-01-01', amount: 1092000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-5-3', accountingDocumentId: 'doc-5', installmentNumber: 3, dueDate: '2026-02-01', amount: 1092000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-01-31' },

  // doc-6: 6 cuotas pagadas
  { id: 'inst-6-1', accountingDocumentId: 'doc-6', installmentNumber: 1, dueDate: '2025-12-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-11-30' },
  { id: 'inst-6-2', accountingDocumentId: 'doc-6', installmentNumber: 2, dueDate: '2026-01-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-6-3', accountingDocumentId: 'doc-6', installmentNumber: 3, dueDate: '2026-02-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-01-31' },
  { id: 'inst-6-4', accountingDocumentId: 'doc-6', installmentNumber: 4, dueDate: '2026-03-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-02-28' },
  { id: 'inst-6-5', accountingDocumentId: 'doc-6', installmentNumber: 5, dueDate: '2026-04-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-03-31' },
  { id: 'inst-6-6', accountingDocumentId: 'doc-6', installmentNumber: 6, dueDate: '2026-05-01', amount: 457800, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-04-30' },

  // doc-7: 6 cuotas pagadas
  { id: 'inst-7-1', accountingDocumentId: 'doc-7', installmentNumber: 1, dueDate: '2025-12-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-11-30' },
  { id: 'inst-7-2', accountingDocumentId: 'doc-7', installmentNumber: 2, dueDate: '2026-01-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-7-3', accountingDocumentId: 'doc-7', installmentNumber: 3, dueDate: '2026-02-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-01-31' },
  { id: 'inst-7-4', accountingDocumentId: 'doc-7', installmentNumber: 4, dueDate: '2026-03-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-02-28' },
  { id: 'inst-7-5', accountingDocumentId: 'doc-7', installmentNumber: 5, dueDate: '2026-04-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-03-31' },
  { id: 'inst-7-6', accountingDocumentId: 'doc-7', installmentNumber: 6, dueDate: '2026-05-01', amount: 430500, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-04-30' },

  // doc-8: endoso 3 cuotas pendientes
  { id: 'inst-8-1', accountingDocumentId: 'doc-8', installmentNumber: 1, dueDate: '2026-03-15', amount: 504000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-8-2', accountingDocumentId: 'doc-8', installmentNumber: 2, dueDate: '2026-04-15', amount: 504000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-8-3', accountingDocumentId: 'doc-8', installmentNumber: 3, dueDate: '2026-05-15', amount: 504000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-9: 12 cuotas establecimiento, parcial
  { id: 'inst-9-1', accountingDocumentId: 'doc-9', installmentNumber: 1, dueDate: '2026-01-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2025-12-31' },
  { id: 'inst-9-2', accountingDocumentId: 'doc-9', installmentNumber: 2, dueDate: '2026-02-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-01-31' },
  { id: 'inst-9-3', accountingDocumentId: 'doc-9', installmentNumber: 3, dueDate: '2026-03-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pagado', paidAt: '2026-02-28' },
  { id: 'inst-9-4', accountingDocumentId: 'doc-9', installmentNumber: 4, dueDate: '2026-04-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-5', accountingDocumentId: 'doc-9', installmentNumber: 5, dueDate: '2026-05-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-6', accountingDocumentId: 'doc-9', installmentNumber: 6, dueDate: '2026-06-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-7', accountingDocumentId: 'doc-9', installmentNumber: 7, dueDate: '2026-07-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-8', accountingDocumentId: 'doc-9', installmentNumber: 8, dueDate: '2026-08-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-9', accountingDocumentId: 'doc-9', installmentNumber: 9, dueDate: '2026-09-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-10', accountingDocumentId: 'doc-9', installmentNumber: 10, dueDate: '2026-10-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-11', accountingDocumentId: 'doc-9', installmentNumber: 11, dueDate: '2026-11-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-9-12', accountingDocumentId: 'doc-9', installmentNumber: 12, dueDate: '2026-12-01', amount: 8190000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-10: 6 cuotas pendientes
  { id: 'inst-10-1', accountingDocumentId: 'doc-10', installmentNumber: 1, dueDate: '2026-01-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-10-2', accountingDocumentId: 'doc-10', installmentNumber: 2, dueDate: '2026-02-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-10-3', accountingDocumentId: 'doc-10', installmentNumber: 3, dueDate: '2026-03-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-10-4', accountingDocumentId: 'doc-10', installmentNumber: 4, dueDate: '2026-04-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-10-5', accountingDocumentId: 'doc-10', installmentNumber: 5, dueDate: '2026-05-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-10-6', accountingDocumentId: 'doc-10', installmentNumber: 6, dueDate: '2026-06-05', amount: 8400000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-12: 12 cuotas pendientes (oficinas)
  { id: 'inst-12-1', accountingDocumentId: 'doc-12', installmentNumber: 1, dueDate: '2026-02-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-12-2', accountingDocumentId: 'doc-12', installmentNumber: 2, dueDate: '2026-03-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-12-3', accountingDocumentId: 'doc-12', installmentNumber: 3, dueDate: '2026-04-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-12-4', accountingDocumentId: 'doc-12', installmentNumber: 4, dueDate: '2026-05-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-12-5', accountingDocumentId: 'doc-12', installmentNumber: 5, dueDate: '2026-06-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-12-6', accountingDocumentId: 'doc-12', installmentNumber: 6, dueDate: '2026-07-05', amount: 2310000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-13: 3 cuotas pendientes
  { id: 'inst-13-1', accountingDocumentId: 'doc-13', installmentNumber: 1, dueDate: '2026-03-03', amount: 735000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-13-2', accountingDocumentId: 'doc-13', installmentNumber: 2, dueDate: '2026-04-03', amount: 735000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-13-3', accountingDocumentId: 'doc-13', installmentNumber: 3, dueDate: '2026-05-03', amount: 735000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },

  // doc-14: 6 cuotas pendientes
  { id: 'inst-14-1', accountingDocumentId: 'doc-14', installmentNumber: 1, dueDate: '2026-04-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-14-2', accountingDocumentId: 'doc-14', installmentNumber: 2, dueDate: '2026-05-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-14-3', accountingDocumentId: 'doc-14', installmentNumber: 3, dueDate: '2026-06-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-14-4', accountingDocumentId: 'doc-14', installmentNumber: 4, dueDate: '2026-07-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-14-5', accountingDocumentId: 'doc-14', installmentNumber: 5, dueDate: '2026-08-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
  { id: 'inst-14-6', accountingDocumentId: 'doc-14', installmentNumber: 6, dueDate: '2026-09-10', amount: 672000, currency: 'ARS', paymentStatus: 'pendiente', paidAt: null },
]
