import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    accountingDocument: { findUnique: jest.fn() },
    emailLog: { findMany: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'

const db = prisma as any
const DOC_ID = '60000000-0000-0000-0000-000000000001'

const emailLog = {
  id: 'email-log-1',
  status: 'SENT',
  provider: 'resend',
  toAddresses: ['destino@empresa.com'],
  ccAddresses: ['copia@empresa.com'],
  bccAddresses: [],
  subject: 'Factura A-0001',
  triggeredByUserId: 'user-1',
  triggeredByEmail: 'operador@empresa.com',
  sentAt: new Date('2026-09-04T12:00:00.000Z'),
  failedAt: null,
  errorMessage: null,
  providerMessageId: 'provider-1',
  metadata: {
    message: 'Mensaje adicional',
    attachmentNames: ['factura.pdf'],
    documentType: 'INVOICE',
    documentNumber: 'A-0001',
  },
  createdAt: new Date('2026-09-04T11:59:00.000Z'),
}

describe('GET /api/v1/documents/:id/email-logs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.accountingDocument.findUnique.mockResolvedValue({ id: DOC_ID })
    db.emailLog.findMany.mockResolvedValue([emailLog])
  })

  it('devuelve el historial completo ordenado y limitado al documento', async () => {
    const res = await request(app)
      .get(`/api/v1/documents/${DOC_ID}/email-logs`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: 'email-log-1',
        status: 'SENT',
        to: ['destino@empresa.com'],
        cc: ['copia@empresa.com'],
        subject: 'Factura A-0001',
        message: 'Mensaje adicional',
        attachments: ['factura.pdf'],
        sentBy: { userId: 'user-1', email: 'operador@empresa.com' },
      }),
    ])
    expect(db.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'AccountingDocument', entityId: DOC_ID },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      }),
    )
  })

  it('devuelve una lista vacía cuando el documento no tiene logs', async () => {
    db.emailLog.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/v1/documents/${DOC_ID}/email-logs`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })

  it('devuelve 404 y no consulta logs cuando el documento no existe', async () => {
    db.accountingDocument.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/v1/documents/${DOC_ID}/email-logs`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(404)
    expect(db.emailLog.findMany).not.toHaveBeenCalled()
  })

  it('devuelve 403 para un usuario sin el módulo documents', async () => {
    db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get(`/api/v1/documents/${DOC_ID}/email-logs`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
    expect(db.accountingDocument.findUnique).not.toHaveBeenCalled()
    expect(db.emailLog.findMany).not.toHaveBeenCalled()
  })
})
