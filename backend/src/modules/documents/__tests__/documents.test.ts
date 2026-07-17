import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    accountingDocument: {
      findMany:   jest.fn(),
      count:      jest.fn(),
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
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
    documentAuditLog: {
      create:   jest.fn(),
      findMany: jest.fn(),
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
const DOC_ID     = '10000000-0000-0000-0000-000000000001'
const INST_ID    = '10000000-0000-0000-0000-000000000002'
const OTHER_ID   = '10000000-0000-0000-0000-000000000099'
const POLICY_ID  = '20000000-0000-0000-0000-000000000010'

const fakeDocument = {
  id: DOC_ID,
  documentType: 'INVOICE',
  documentStatus: 'ISSUED',
  documentNumber: 'FAC-2026-001',
  issueDate: BASE_DATE,
  netAmount: 1000,
  vatAmount: 210,
  otherTaxesAmount: 50,
  currency: 'ARS',
  exchangeRate: 1,
  description: null,
  insuranceCompany: 'MAPFRE',
  paymentStatus: 'PENDING',
  paymentMethod: null,
  linkedDocumentId: null,
  relationType: null,
  adjustmentReason: null,
  adjustmentSign: null,
  policyId: null,
  economicImpactType: null,
  endorsementType: null,
  endorsementEffectiveDate: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  installments: [],
  allocations: [],
  attachments: [],
  _count: { installments: 0, allocations: 0, attachments: 0 },
}

const validDocumentBody = {
  documentType: 'INVOICE',
  documentNumber: 'FAC-2026-001',
  issueDate: '2026-01-01',
  netAmount: 1000,
  vatAmount: 210,
  otherTaxesAmount: 50,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Documents API', () => {
  // documents.service.ts envuelve create/update/apply/cancel/updateInstallment
  // en prisma.$transaction(async (tx) => ...) para que la escritura financiera
  // y su audit log sean atómicas. Acá el mock de tx es el mismo objeto `db`
  // que ya usa el resto de los tests — así los mocks configurados por test
  // (ej. db.accountingDocument.update.mockResolvedValue(...)) siguen aplicando
  // sin importar si el código real llama a `prisma.X` o `tx.X`. También cubre
  // la forma en array ($transaction([...])) que sigue usando replaceInstallments.
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
    )
  })

  // ── GET /api/v1/documents/types ─────────────────────────────────────────────

  describe('GET /api/v1/documents/types', () => {
    it('returns 200 with the 6 controlled document types and adjustment reasons', async () => {
      const res = await request(app)
        .get('/api/v1/documents/types')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.types).toHaveLength(6)
      const keys = res.body.data.types.map((t: any) => t.key)
      expect(keys).toEqual(
        expect.arrayContaining(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ENDORSEMENT', 'REBILLING', 'ADJUSTMENT_ENTRY']),
      )
      expect(res.body.data.adjustmentReasons.length).toBeGreaterThan(0)
    })
  })

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

    it('records a CREATE audit log entry with the performer email', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(201)
      const auditCall = db.documentAuditLog.create.mock.calls[0][0]
      expect(auditCall.data.action).toBe('CREATE')
      expect(auditCall.data.accountingDocumentId).toBe(DOC_ID)
      expect(auditCall.data.performedBy).toBeTruthy()
    })

    it('returns 201 when a USER with the documents module creates document', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['documents'] }))
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 when a USER without the documents module tries to create document', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(403)
    })

    // No hay @unique en documentNumber a propósito — distintos tipos o
    // compañías pueden compartir numeración. El duplicado real es la
    // combinación tipo + compañía + número, chequeada con findFirst.
    it('returns 409 when a document with the same type + company + number already exists', async () => {
      db.accountingDocument.findFirst.mockResolvedValue(fakeDocument) // duplicate!

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('allows the same documentNumber for a different documentType/company (no false duplicate)', async () => {
      db.accountingDocument.findFirst.mockResolvedValue(null) // no match for this type+company combo
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(201)
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

    it('accepts DEBIT_NOTE as valid documentType', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, documentType: 'DEBIT_NOTE', documentNumber: 'ND-001' })

      expect(res.status).toBe(201)
    })

    it('returns 400 when CREDIT_NOTE is created without linkedDocumentId', async () => {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, documentType: 'CREDIT_NOTE', documentNumber: 'NC-001' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when CREDIT_NOTE links to a document of the wrong type', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'ENDORSEMENT' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'CREDIT_NOTE',
          documentNumber: 'NC-001',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 201 and forces paymentStatus to NOT_APPLICABLE for CREDIT_NOTE', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'INVOICE' })
      db.accountingDocument.create.mockResolvedValue({
        ...fakeDocument,
        documentType: 'CREDIT_NOTE',
        paymentStatus: 'NOT_APPLICABLE',
        linkedDocumentId: OTHER_ID,
      })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'CREDIT_NOTE',
          documentNumber: 'NC-001',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(201)
      const createCall = db.accountingDocument.create.mock.calls[0][0]
      expect(createCall.data.paymentStatus).toBe('NOT_APPLICABLE')
    })

    it('returns 400 when ADJUSTMENT_ENTRY is created without adjustmentReason or adjustmentSign', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ADJUSTMENT_ENTRY',
          documentNumber: 'AJ-001',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT is created without policyId', async () => {
      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          economicImpactType: 'NO_IMPACT',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT policyId references an inactive or missing policy', async () => {
      db.policy.findMany.mockResolvedValue([]) // policyId not found among active policies

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          policyId: POLICY_ID,
          economicImpactType: 'NO_IMPACT',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })

    it('returns 400 when ENDORSEMENT is created without economicImpactType', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          policyId: POLICY_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT has non-zero amounts (hasOwnAmounts is false)', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          policyId: POLICY_ID,
          economicImpactType: 'NO_IMPACT',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT with INCREASES_COST links to a CREDIT_NOTE', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'CREDIT_NOTE' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT with DECREASES_COST links to an INVOICE', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'INVOICE' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          policyId: POLICY_ID,
          economicImpactType: 'DECREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 201 when ENDORSEMENT with INCREASES_COST links to a DEBIT_NOTE', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE' })
      db.accountingDocument.create.mockResolvedValue({
        ...fakeDocument,
        documentType: 'ENDORSEMENT',
        netAmount: 0,
        vatAmount: 0,
        otherTaxesAmount: 0,
        paymentStatus: 'NOT_APPLICABLE',
        policyId: POLICY_ID,
        economicImpactType: 'INCREASES_COST',
        linkedDocumentId: OTHER_ID,
      })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          netAmount: 0,
          vatAmount: 0,
          otherTaxesAmount: 0,
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(201)
    })

    it('forces relationType from the type definition, ignoring a mismatched client-sent value', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        // INVOICE has no relationType — sending one should be ignored, not persisted.
        .send({ ...validDocumentBody, relationType: 'ADJUSTS' })

      expect(res.status).toBe(201)
      const createCall = db.accountingDocument.create.mock.calls[0][0]
      expect(createCall.data.relationType).toBeNull()
    })

    it('forces documentStatus to ISSUED on create, ignoring a client-sent value', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, documentStatus: 'APPLIED' })

      expect(res.status).toBe(201)
      const createCall = db.accountingDocument.create.mock.calls[0][0]
      expect(createCall.data.documentStatus).toBe('ISSUED')
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

    it('returns 400 and blocks editing when the document is already APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentStatus: 'APPLIED' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netAmount: 2000 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(db.accountingDocument.update).not.toHaveBeenCalled()
    })

    it('ignores a documentStatus sent in the body — the status can only change via /apply or /cancel', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument) // ISSUED
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
        .send({ netAmount: 2000, documentStatus: 'APPLIED' })

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ documentStatus: expect.anything() }),
        }),
      )
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

    it('returns 200 and resets paymentStatus to PENDING', async () => {
      // replaceInstallments calls assertDocumentExists, then findInstallments which also calls assertDocumentExists
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(fakeDocument) // assertDocumentExists in replaceInstallments
        .mockResolvedValueOnce(fakeDocument) // assertDocumentExists in findInstallments
      // $transaction receives an array of Prisma lazy promises — just resolve it
      db.$transaction.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PENDING' })
      db.documentInstallment.findMany.mockResolvedValue([
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 1, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'PENDING', paymentDate: null },
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 2, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'PENDING', paymentDate: null },
        { id: INST_ID, accountingDocumentId: DOC_ID, installmentNumber: 3, dueDate: BASE_DATE, amount: 420, currency: 'ARS', paymentStatus: 'PENDING', paymentDate: null },
      ])

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(installmentsBody)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(3)
      // Verify the paymentStatus reset to 'PENDING'
      expect(db.accountingDocument.update.mock.calls[0][0].data.paymentStatus).toBe('PENDING')
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
      paymentStatus: 'PENDING',
      paymentDate: null,
    }

    it('recalculates document status to "PAID" when all installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue({ ...fakeInstallment, paymentStatus: 'PAID' })
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'PAID' },
        { paymentStatus: 'PAID' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PAID' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PAID' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('PAID')
    })

    it('recalculates document status to "PARTIALLY_PAID" when some installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue({ ...fakeInstallment, paymentStatus: 'PAID' })
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'PAID' },
        { paymentStatus: 'PENDING' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PARTIALLY_PAID' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PAID' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('PARTIALLY_PAID')
    })

    it('recalculates document status to "PENDING" when no installments are paid', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue(fakeInstallment)
      db.documentInstallment.findMany.mockResolvedValue([
        { paymentStatus: 'PENDING' },
        { paymentStatus: 'PENDING' },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PENDING' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PENDING' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('PENDING')
    })
  })

  // ── DELETE /api/v1/documents/:id ────────────────────────────────────────────

  describe('DELETE /api/v1/documents/:id', () => {
    it('returns 200 when ADMIN deletes document', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValueOnce(null) // sin dependientes
      db.accountingDocument.delete.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
    })

    it('returns 400 and blocks deleting when the document is already APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentStatus: 'APPLIED' })

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(db.accountingDocument.delete).not.toHaveBeenCalled()
    })

    it('returns 409 and blocks deleting when another document is linked to it', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValueOnce({
        id: OTHER_ID,
        documentNumber: 'NC-001',
        documentType: 'CREDIT_NOTE',
      })

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('HAS_DEPENDENTS')
      expect(db.accountingDocument.delete).not.toHaveBeenCalled()
    })

    it('returns 403 when a USER without the documents module tries to delete', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── GET /api/v1/documents/:id/balance (Fase 2) ──────────────────────────────

  describe('GET /api/v1/documents/:id/balance', () => {
    // fakeDocument: INVOICE, netAmount 1000 + vat 210 + other 50 = totalAmount 1260

    it('returns 404 when the document does not exist', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/documents/${OTHER_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('subtracts an APPLIED CREDIT_NOTE from effectiveAmount', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'NC-001', documentType: 'CREDIT_NOTE', documentStatus: 'APPLIED', netAmount: 300, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.originalAmount).toBe(1260)
      expect(res.body.data.appliedCredits).toBe(300)
      expect(res.body.data.effectiveAmount).toBe(960)
    })

    it('does not subtract a CREDIT_NOTE that is still ISSUED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'NC-001', documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', netAmount: 300, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedCredits).toBe(0)
      expect(res.body.data.effectiveAmount).toBe(1260)
    })

    it('does not add an ISSUED DEBIT_NOTE to appliedDebits', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'ND-001', documentType: 'DEBIT_NOTE', documentStatus: 'ISSUED', netAmount: 200, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedDebits).toBe(0)
      expect(res.body.data.effectiveAmount).toBe(1260)
    })

    it('adds an APPLIED DEBIT_NOTE to appliedDebits', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'ND-001', documentType: 'DEBIT_NOTE', documentStatus: 'APPLIED', netAmount: 200, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedDebits).toBe(200)
      expect(res.body.data.effectiveAmount).toBe(1460)
    })

    it('ignores a CANCELLED DEBIT_NOTE even if it were somehow marked APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'ND-001', documentType: 'DEBIT_NOTE', documentStatus: 'CANCELLED', netAmount: 200, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedDebits).toBe(0)
      expect(res.body.data.effectiveAmount).toBe(1260)
    })

    it('ignores a CANCELLED DEBIT_NOTE', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'ND-001', documentType: 'DEBIT_NOTE', documentStatus: 'CANCELLED', netAmount: 200, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedDebits).toBe(0)
      expect(res.body.data.effectiveAmount).toBe(1260)
    })

    it('applies a POSITIVE ADJUSTMENT_ENTRY as an increase when APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'AJ-001', documentType: 'ADJUSTMENT_ENTRY', documentStatus: 'APPLIED', netAmount: 100, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: 'POSITIVE' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedAdjustments).toBe(100)
      expect(res.body.data.effectiveAmount).toBe(1360)
    })

    it('applies a NEGATIVE ADJUSTMENT_ENTRY as a decrease when APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'AJ-001', documentType: 'ADJUSTMENT_ENTRY', documentStatus: 'APPLIED', netAmount: 100, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: 'NEGATIVE' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedAdjustments).toBe(-100)
      expect(res.body.data.effectiveAmount).toBe(1160)
    })

    it('ignores an ADJUSTMENT_ENTRY that is still ISSUED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'AJ-001', documentType: 'ADJUSTMENT_ENTRY', documentStatus: 'ISSUED', netAmount: 100, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: 'NEGATIVE' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.appliedAdjustments).toBe(0)
      expect(res.body.data.effectiveAmount).toBe(1260)
    })

    it('lists a REBILLING in relatedDocs without affecting the numeric balance', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'RF-001', documentType: 'REBILLING', documentStatus: 'APPLIED', netAmount: 500, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.effectiveAmount).toBe(1260)
      expect(res.body.data.relatedDocs).toHaveLength(1)
      expect(res.body.data.relatedDocs[0].documentType).toBe('REBILLING')
    })

    it('returns paidAmount/outstandingBalance/creditBalance as 0 when the type has no payment status', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'CREDIT_NOTE' })
      db.accountingDocument.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.paidAmount).toBe(0)
      expect(res.body.data.outstandingBalance).toBe(0)
      expect(res.body.data.creditBalance).toBe(0)
      // hasPaymentStatus=false for CREDIT_NOTE, so installments shouldn't even be queried
      expect(db.documentInstallment.findMany).not.toHaveBeenCalled()
    })
  })

  // ── POST /api/v1/documents/:id/apply (Fase 2) ───────────────────────────────

  describe('POST /api/v1/documents/:id/apply', () => {
    it('returns 400 when the type does not support APPLIED (INVOICE)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument) // INVOICE

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 409 when the document is already APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'ENDORSEMENT', documentStatus: 'APPLIED' })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('returns 400 when the document is CANCELLED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'ENDORSEMENT', documentStatus: 'CANCELLED' })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('applies an ENDORSEMENT successfully (no balance check needed)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'ENDORSEMENT', documentStatus: 'ISSUED', linkedDocumentId: null })
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentType: 'ENDORSEMENT', documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentStatus).toBe('APPLIED')
      const auditCall = db.documentAuditLog.create.mock.calls[0][0]
      expect(auditCall.data.action).toBe('APPLY')
    })

    it('applies a DEBIT_NOTE successfully (generic status flip, no balance check)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID })
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE', documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentStatus).toBe('APPLIED')
    })

    it('returns 400 when a CREDIT_NOTE exceeds the linked invoice available balance', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 2000, vatAmount: 0, otherTaxesAmount: 0 }
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(creditNote) // assertDocumentExists(the credit note)
        .mockResolvedValueOnce(fakeDocument) // getBalance base = linked invoice, totalAmount 1260
      db.accountingDocument.findMany.mockResolvedValue([]) // no other related docs to the invoice
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(db.accountingDocument.update).not.toHaveBeenCalled()
    })

    it('applies a CREDIT_NOTE that fits within the linked invoice balance', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 300, vatAmount: 0, otherTaxesAmount: 0 }
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(creditNote)
        .mockResolvedValueOnce(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.documentPolicyAllocation.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentStatus).toBe('APPLIED')
    })

    it('creates proportional negative allocations when applying a CREDIT_NOTE linked to an invoice with allocations', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 100, vatAmount: 0, otherTaxesAmount: 0 }
      const POLICY_A = '20000000-0000-0000-0000-000000000001'
      const POLICY_B = '20000000-0000-0000-0000-000000000002'
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(creditNote) // assertDocumentExists(creditNote)
        .mockResolvedValueOnce(fakeDocument) // getBalance base = linked invoice
      db.accountingDocument.findMany.mockResolvedValue([]) // no other docs related to the invoice
      db.documentInstallment.findMany.mockResolvedValue([])
      db.documentPolicyAllocation.findMany.mockResolvedValue([
        { policyId: POLICY_A, allocationPercentage: 40 },
        { policyId: POLICY_B, allocationPercentage: 60 },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.documentPolicyAllocation.createMany).toHaveBeenCalledWith({
        data: [
          { policyId: POLICY_A, allocatedAmount: -40, allocationPercentage: 40, accountingDocumentId: DOC_ID },
          { policyId: POLICY_B, allocatedAmount: -60, allocationPercentage: 60, accountingDocumentId: DOC_ID },
        ],
      })
    })

    it('applies a CREDIT_NOTE without creating allocations when the linked invoice has none', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 100, vatAmount: 0, otherTaxesAmount: 0 }
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(creditNote)
        .mockResolvedValueOnce(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.documentPolicyAllocation.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.documentPolicyAllocation.createMany).not.toHaveBeenCalled()
    })

    it('returns 403 when a USER without the documents module tries to apply', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── POST /api/v1/documents/:id/cancel (Fase 2) ──────────────────────────────

  describe('POST /api/v1/documents/:id/cancel', () => {
    it('returns 409 when the document is already CANCELLED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentStatus: 'CANCELLED' })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('cancels a document successfully from ISSUED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentStatus: 'CANCELLED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentStatus).toBe('CANCELLED')
    })

    it('returns 403 when a USER without the documents module tries to cancel', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('persists the cancellation reason in the audit log', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentStatus: 'CANCELLED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Error de carga' })

      expect(res.status).toBe(200)
      const auditCall = db.documentAuditLog.create.mock.calls[0][0]
      expect(auditCall.data.action).toBe('CANCEL')
      expect(auditCall.data.reason).toBe('Error de carga')
    })
  })

  // ── GET /api/v1/documents/:id/audit-log (Fase 4) ────────────────────────────

  describe('GET /api/v1/documents/:id/audit-log', () => {
    it('returns the audit log ordered by most recent first', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.documentAuditLog.findMany.mockResolvedValue([
        { id: '1', accountingDocumentId: DOC_ID, action: 'CREATE', description: 'Factura creada', createdAt: BASE_DATE },
      ])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/audit-log`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(db.documentAuditLog.findMany).toHaveBeenCalledWith({
        where: { accountingDocumentId: DOC_ID },
        orderBy: { createdAt: 'desc' },
      })
    })
  })
})
