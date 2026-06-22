import request from 'supertest'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    accountingDocument: {
      findMany:   jest.fn(),
      count:      jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
    documentInstallment: {
      findMany:   jest.fn(),
      findFirst:  jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      update:     jest.fn(),
    },
    documentPolicyAllocation: {
      findMany:   jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    documentAttachment: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      delete:    jest.fn(),
    },
    policy: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary:     jest.fn(),
  deleteFromCloudinary:   jest.fn(),
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z')

// Proper UUID format required by Zod .uuid() validation
const DOC_ID   = '10000000-0000-0000-0000-000000000001'
const INST_ID  = '10000000-0000-0000-0000-000000000002'
const OTHER_ID = '10000000-0000-0000-0000-000000000099'

const fakeDocument = {
  id: DOC_ID,
  documentType: 'factura',
  documentNumber: 'FAC-2026-001',
  issueDate: BASE_DATE,
  netAmount: 1000,
  vatAmount: 210,
  otherTaxesAmount: 50,
  currency: 'ARS',
  exchangeRate: 1,
  description: null,
  insuranceCompany: 'MAPFRE',
  paymentStatus: 'pendiente',
  paymentMethod: null,
  linkedDocumentId: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  installments: [],
  allocations: [],
  attachments: [],
  _count: { installments: 0, allocations: 0, attachments: 0 },
}

const validDocumentBody = {
  documentType: 'factura',
  documentNumber: 'FAC-2026-001',
  issueDate: '2026-01-01',
  netAmount: 1000,
  vatAmount: 210,
  otherTaxesAmount: 50,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Documents API', () => {

  // ── GET /api/v1/documents ───────────────────────────────────────────────────

  describe('GET /api/v1/documents', () => {
    it('returns 200 with paginated list', async () => {
      db.accountingDocument.findMany.mockResolvedValue([fakeDocument])
      db.accountingDocument.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.pagination.total).toBe(1)
    })

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/documents')
      expect(res.status).toBe(401)
    })
  })

  // ── GET /api/v1/documents/:id ───────────────────────────────────────────────

  describe('GET /api/v1/documents/:id', () => {
    it('returns 200 and computes totalAmount correctly', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      // 1000 + 210 + 50 = 1260
      expect(res.body.data.totalAmount).toBe(1260)
    })

    it('totalAmount rounds correctly for floating point amounts', async () => {
      const docWithFloats = {
        ...fakeDocument,
        netAmount: 1000.1,
        vatAmount: 210.02,
        otherTaxesAmount: 0.003,
      }
      db.accountingDocument.findUnique.mockResolvedValue(docWithFloats)

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      // 1000.1 + 210.02 + 0.003 = 1210.123 → rounded to 2 decimals
      expect(res.body.data.totalAmount).toBe(1210.12)
    })

    it('returns 404 when document does not exist', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/documents/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  // ── POST /api/v1/documents ──────────────────────────────────────────────────

  describe('POST /api/v1/documents', () => {
    it('returns 201 with totalAmount computed', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null) // no duplicate
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(201)
      expect(res.body.data.totalAmount).toBe(1260)
      expect(res.body.data.documentNumber).toBe('FAC-2026-001')
    })

    it('returns 201 when CONTADOR creates document', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${contadorToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 when VIEWER tries to create document', async () => {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(403)
    })

    it('returns 409 when documentNumber already exists', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument) // duplicate!

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('returns 422 when documentType is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, documentType: 'tipo_invalido' })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 422 when netAmount is missing', async () => {
      const { netAmount: _, ...bodyWithoutAmount } = validDocumentBody
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(bodyWithoutAmount)

      expect(res.status).toBe(422)
    })

    it('accepts nota_debito as valid documentType', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue({ ...fakeDocument, documentType: 'nota_debito' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, documentType: 'nota_debito', documentNumber: 'ND-001' })

      expect(res.status).toBe(201)
    })
  })

  // ── PUT /api/v1/documents/:id ───────────────────────────────────────────────

  describe('PUT /api/v1/documents/:id', () => {
    it('returns 200 when ADMIN updates document', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.update.mockResolvedValue({
        ...fakeDocument,
        netAmount: 2000,
        installments: [],
        allocations: [],
        attachments: [],
      })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netAmount: 2000 })

      expect(res.status).toBe(200)
    })

    it('returns 400 when linkedDocumentId points to itself', async () => {
      // assertDocumentExists is called twice: once for the document, once to validate linkedDocumentId
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        // linkedDocumentId must be a valid UUID but same as the document ID
        .send({ linkedDocumentId: DOC_ID })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })
  })

  // ── PUT /api/v1/documents/:id/installments ──────────────────────────────────

  describe('PUT /api/v1/documents/:id/installments', () => {
    const installmentsBody = {
      installments: [
        { installmentNumber: 1, dueDate: '2026-02-01', amount: 420 },
        { installmentNumber: 2, dueDate: '2026-03-01', amount: 420 },
        { installmentNumber: 3, dueDate: '2026-04-01', amount: 420 },
      ],
    }

    it('returns 200 and resets paymentStatus to pendiente', async () => {
      // replaceInstallments calls assertDocumentExists, then findInstallments which also calls assertDocumentExists
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(fakeDocument) // assertDocumentExists in replaceInstallments
        .mockResolvedValueOnce(fakeDocument) // assertDocumentExists in findInstallments
      // $transaction receives an array of Prisma lazy promises — just resolve it
      db.$transaction.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'pendiente' })
      db.documentInstallment.findMany.mockResolvedValue([
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 1, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'pendiente', paymentDate: null },
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 2, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'pendiente', paymentDate: null },
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 3, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'pendiente', paymentDate: null },
      ])

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(installmentsBody)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
      // Verify the paymentStatus reset to 'pendiente'
      expect(db.accountingDocument.update.mock.calls[0][0].data.paymentStatus).toBe('pendiente')
    })
  })

  // ── Installment status recalculation ────────────────────────────────────────

  describe('PUT /api/v1/documents/:id/installments/:installmentId', () => {
    const fakeInstallment = {
      id: INST_ID,
      accountingDocumentId: DOC_ID,
      installmentNumber: 1,
      dueDate: BASE_DATE,
      amount: 420,
      currency: 'ARS',
      paymentStatus: 'pendiente',
      paymentDate: null,
    }

    it('recalculates document status to "pagado" when all installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue({ ...fakeInstallment, paymentStatus: 'pagado' })
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'pagado' },
        { paymentStatus: 'pagado' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'pagado' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'pagado' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('pagado')
    })

    it('recalculates document status to "parcial" when some installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue({ ...fakeInstallment, paymentStatus: 'pagado' })
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'pagado' },
        { paymentStatus: 'pendiente' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'parcial' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'pagado' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('parcial')
    })

    it('recalculates document status to "pendiente" when no installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue(fakeInstallment)
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'pendiente' },
        { paymentStatus: 'pendiente' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'pendiente' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'pendiente' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('pendiente')
    })
  })

  // ── DELETE /api/v1/documents/:id ────────────────────────────────────────────

  describe('DELETE /api/v1/documents/:id', () => {
    it('returns 200 when ADMIN deletes document', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.delete.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
    })

    it('returns 403 when VIEWER tries to delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${viewerToken()}`)

      expect(res.status).toBe(403)
    })
  })
})
