import request from 'supertest'
import { Prisma } from '@prisma/client'
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
      count:      jest.fn(),
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
    installmentAdjustmentApplication: {
      findMany:   jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
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
  paymentMethod: 'Transferencia bancaria',
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
    // Default: la NC no tiene asignaciones propias todavía → apply() genera
    // las automáticas de siempre. Los tests que prueban la distribución
    // manual sobrescriben esto a un valor > 0.
    db.documentPolicyAllocation.count.mockResolvedValue(0)
  })

  // ── GET /api/v1/documents/types ─────────────────────────────────────────────

  describe('GET /api/v1/documents/types', () => {
    it('returns 200 with the 5 controlled document types and adjustment reasons', async () => {
      const res = await request(app)
        .get('/api/v1/documents/types')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.types).toHaveLength(5)
      const keys = res.body.data.types.map((t: any) => t.key)
      expect(keys).toEqual(
        expect.arrayContaining(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ENDORSEMENT', 'ADJUSTMENT_ENTRY']),
      )
      expect(keys).not.toContain('REBILLING')
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

    it('copies the document payment method to installments created with it', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)
      db.accountingDocument.create.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          paymentMethod: 'E-Cheq',
          installments: [
            { installmentNumber: 1, dueDate: '2026-02-01', amount: 630 },
            { installmentNumber: 2, dueDate: '2026-03-01', amount: 630 },
          ],
        })

      expect(res.status).toBe(201)
      const installmentCreates =
        db.accountingDocument.create.mock.calls[0][0].data.installments.create
      expect(installmentCreates).toHaveLength(2)
      expect(installmentCreates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ paymentMethod: 'E-Cheq' }),
          expect.objectContaining({ paymentMethod: 'E-Cheq' }),
        ]),
      )
    })

    it('inherits the linked document payment method for an associated document', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({
        ...fakeDocument,
        paymentMethod: 'E-Cheq',
      })
      db.accountingDocument.create.mockResolvedValue({
        ...fakeDocument,
        documentType: 'CREDIT_NOTE',
        linkedDocumentId: OTHER_ID,
        paymentMethod: 'E-Cheq',
      })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'CREDIT_NOTE',
          documentNumber: 'NC-001',
          linkedDocumentId: OTHER_ID,
          paymentMethod: 'Efectivo',
        })

      expect(res.status).toBe(201)
      expect(db.accountingDocument.create.mock.calls[0][0].data.paymentMethod).toBe('E-Cheq')
    })

    it('rejects associating a document whose source has no payment method', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({
        ...fakeDocument,
        paymentMethod: null,
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

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('no tiene medio de pago')
      expect(db.accountingDocument.create).not.toHaveBeenCalled()
    })

    it('returns 409 CONFLICT when the DB unique constraint catches a duplicate the pre-check missed (race)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null) // pasa el pre-chequeo
      db.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['documentType', 'insuranceCompany', 'documentNumber'] },
        }),
      )

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDocumentBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
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

    it('returns 400 when netAmount is negative (amounts are always a magnitude)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDocumentBody, netAmount: -1000 })

      expect(res.status).toBe(400)
      expect(db.accountingDocument.create).not.toHaveBeenCalled()
    })

    it('returns 400 when an ADJUSTMENT_ENTRY has a negative netAmount, even with adjustmentSign NEGATIVE', async () => {
      // El documento vinculado (requerido para ADJUSTMENT_ENTRY) debe existir
      // y no estar anulado para llegar hasta la validación de monto.
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentStatus: 'ISSUED' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          documentType: 'ADJUSTMENT_ENTRY',
          documentNumber: 'AJ-2026-001',
          issueDate: '2026-01-01',
          netAmount: -100,
          vatAmount: 0,
          otherTaxesAmount: 0,
          linkedDocumentId: DOC_ID,
          adjustmentReason: 'ROUNDING_DIFFERENCE',
          adjustmentSign: 'NEGATIVE',
        })

      expect(res.status).toBe(400)
      expect(db.accountingDocument.create).not.toHaveBeenCalled()
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

    it('returns 400 when ENDORSEMENT with NO_IMPACT has a non-zero amount', async () => {
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

    it('returns 400 when ENDORSEMENT with INCREASES_COST has no linkedDocumentId or amount', async () => {
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
          economicImpactType: 'INCREASES_COST',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT links to a CREDIT_NOTE instead of the original INVOICE', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'CREDIT_NOTE' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when ENDORSEMENT links to a DEBIT_NOTE instead of the original INVOICE', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE' })

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when the linked INVOICE belongs to a different policy than the one the ENDORSEMENT modifies', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'INVOICE' })
      db.documentPolicyAllocation.findMany.mockResolvedValue([
        { policyAssetCoverage: { policyId: OTHER_ID } },
      ])

      const res = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validDocumentBody,
          documentType: 'ENDORSEMENT',
          documentNumber: 'END-001',
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 201 when ENDORSEMENT with INCREASES_COST links to the INVOICE of the same policy, and affects its balance', async () => {
      db.policy.findMany.mockResolvedValue([{ id: POLICY_ID }])
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'INVOICE' })
      db.documentPolicyAllocation.findMany.mockResolvedValue([
        { policyAssetCoverage: { policyId: POLICY_ID } },
      ])
      db.accountingDocument.create.mockResolvedValue({
        ...fakeDocument,
        documentType: 'ENDORSEMENT',
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
          policyId: POLICY_ID,
          economicImpactType: 'INCREASES_COST',
          linkedDocumentId: OTHER_ID,
        })

      expect(res.status).toBe(201)
      const createCall = db.accountingDocument.create.mock.calls[0][0]
      // hasOwnAmounts:true ahora — el importe de validDocumentBody (1000+210+50) se persiste tal cual.
      expect(createCall.data.netAmount).toBe(1000)
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

    it('keeps the linked document payment method when updating an associated document', async () => {
      const debitNote = {
        ...fakeDocument,
        documentType: 'DEBIT_NOTE',
        linkedDocumentId: OTHER_ID,
        paymentMethod: 'Transferencia bancaria',
      }
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(debitNote)
        .mockResolvedValueOnce({ ...fakeDocument, paymentMethod: 'E-Cheq' })
      db.accountingDocument.update.mockResolvedValue({
        ...debitNote,
        paymentMethod: 'E-Cheq',
        installments: [],
        allocations: [],
        attachments: [],
      })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentMethod: 'Efectivo' })

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.paymentMethod).toBe('E-Cheq')
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

    // documentNumber dejó de ser inmutable — se puede corregir un typo
    // después del alta (ver useDuplicateDocumentNumberCheck en el frontend).
    it('allows correcting the documentNumber', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValue(null) // sin duplicado
      db.accountingDocument.update.mockResolvedValue({
        ...fakeDocument,
        documentNumber: 'FAC-2026-002',
        installments: [],
        allocations: [],
        attachments: [],
      })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ documentNumber: 'FAC-2026-002' })

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentNumber).toBe('FAC-2026-002')
    })

    it('returns 409 when the corrected documentNumber collides with another document of the same type + company', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValue({ id: OTHER_ID }) // duplicado de otro documento

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ documentNumber: 'FAC-2026-999' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
      expect(db.accountingDocument.update).not.toHaveBeenCalled()
    })

    it('does not treat the document as a duplicate of itself when documentNumber is left unchanged', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValue(null) // excluye el propio id (ver where: { id: { not: id } })
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
      expect(db.accountingDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: DOC_ID }, documentNumber: fakeDocument.documentNumber }),
        }),
      )
    })
  })

  describe('GET /api/v1/documents/check-number', () => {
    it('excludes the given document id from the duplicate check', async () => {
      db.accountingDocument.findFirst.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/documents/check-number?documentNumber=FAC-2026-001&documentType=INVOICE&insuranceCompany=MAPFRE&excludeId=${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.exists).toBe(false)
      expect(db.accountingDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: DOC_ID } }) }),
      )
    })

    it('reports exists=true when another document already has that number', async () => {
      db.accountingDocument.findFirst.mockResolvedValue({ id: OTHER_ID })

      const res = await request(app)
        .get('/api/v1/documents/check-number?documentNumber=FAC-2026-001&documentType=INVOICE&insuranceCompany=MAPFRE')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.exists).toBe(true)
    })
  })

  describe('GET /api/v1/documents/financial', () => {
    it('filters by dueDate regardless of payment status — Análisis Financiero siempre posiciona por vencimiento', async () => {
      db.accountingDocument.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/documents/financial?from=2026-02&to=2026-03')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            installments: {
              some: {
                dueDate: {
                  gte: new Date('2026-02-01T00:00:00.000Z'),
                  lt: new Date('2026-04-01T00:00:00.000Z'),
                },
              },
            },
          }),
        }),
      )
    })

    it('returns the payment method stored on each installment', async () => {
      db.accountingDocument.findMany.mockResolvedValue([
        {
          ...fakeDocument,
          installments: [{
            id: INST_ID,
            accountingDocumentId: DOC_ID,
            installmentNumber: 1,
            dueDate: BASE_DATE,
            amount: 420,
            currency: 'ARS',
            amountArs: 420,
            amountUsd: 0.35,
            paymentStatus: 'PAID',
            paymentDate: BASE_DATE,
            paymentMethod: 'E-Cheq',
          }],
          allocations: [],
        },
      ])

      const res = await request(app)
        .get('/api/v1/documents/financial')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data[0].installments[0]).toMatchObject({
        paymentMethod: 'E-Cheq',
        paidAt: '2026-01-01',
      })
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
        .mockResolvedValueOnce({ ...fakeDocument, paymentMethod: 'E-Cheq' }) // assertDocumentExists in replaceInstallments
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
      expect(db.documentInstallment.createMany.mock.calls[0][0].data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ paymentMethod: 'E-Cheq' }),
        ]),
      )
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
      paymentMethod: null,
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
        .send({ paymentStatus: 'PAID', exchangeRate: 1200, paymentMethod: 'E-Cheq' })

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
        .send({ paymentStatus: 'PAID', exchangeRate: 1200, paymentMethod: 'Efectivo' })

      expect(res.status).toBe(200)
      const updateCall = db.accountingDocument.update.mock.calls[0][0]
      expect(updateCall.data.paymentStatus).toBe('PARTIALLY_PAID')
    })

    it('rejects marking an installment as PAID without exchangeRate', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PAID' })

      expect(res.status).toBe(400)
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
    })

    it('rejects marking an installment as PAID without a payment method', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PAID', exchangeRate: 1200 })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('medio de pago')
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
    })

    it('allows editing a paid installment without resending its existing payment method', async () => {
      const paidInstallment = {
        ...fakeInstallment,
        paymentStatus: 'PAID',
        paymentMethod: 'Transferencia bancaria',
      }
      db.documentInstallment.findFirst.mockResolvedValue(paidInstallment)
      db.documentInstallment.update.mockResolvedValue(paidInstallment)
      db.documentInstallment.findMany.mockResolvedValue([{ paymentStatus: 'PAID' }])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PAID' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ dueDate: '2026-08-15' })

      expect(res.status).toBe(200)
    })

    it('rejects removing the payment method from an already-paid installment', async () => {
      db.documentInstallment.findFirst.mockResolvedValue({
        ...fakeInstallment,
        paymentStatus: 'PAID',
        paymentMethod: 'E-Cheq',
      })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentMethod: null })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('medio de pago')
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
    })

    it('computes amountArs/amountUsd from the provided exchangeRate when marking as PAID', async () => {
      db.documentInstallment.findFirst.mockResolvedValue(fakeInstallment)
      db.documentInstallment.update.mockResolvedValue({ ...fakeInstallment, paymentStatus: 'PAID' })
      db.documentInstallment.findMany.mockResolvedValue([{ paymentStatus: 'PAID' }])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, paymentStatus: 'PAID' })

      const res = await request(app)
        .put(`/api/v1/documents/${DOC_ID}/installments/${INST_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ paymentStatus: 'PAID', exchangeRate: 1200, paymentMethod: 'E-Cheq' })

      expect(res.status).toBe(200)
      const installmentUpdateCall = db.documentInstallment.update.mock.calls[0][0]
      // fakeInstallment.currency === 'ARS' → amountArs = amount, amountUsd = amount / exchangeRate
      expect(installmentUpdateCall.data.amountArs).toBe(420)
      expect(installmentUpdateCall.data.amountUsd).toBeCloseTo(420 / 1200, 5)
      expect(installmentUpdateCall.data.exchangeRate).toBeUndefined()
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
      db.documentAttachment.findMany.mockResolvedValue([])
      db.accountingDocument.delete.mockResolvedValue(fakeDocument)

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
    })

    it('deletes the Cloudinary file for every attachment before deleting the document', async () => {
      const { deleteFromCloudinary } = jest.requireMock('../../../config/cloudinary') as {
        deleteFromCloudinary: jest.Mock
      }
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValueOnce(null) // sin dependientes
      db.documentAttachment.findMany.mockResolvedValue([
        { cloudinaryPublicId: 'seguros/documents/a' },
        { cloudinaryPublicId: null },
        { cloudinaryPublicId: 'seguros/documents/b' },
      ])
      db.accountingDocument.delete.mockResolvedValue(fakeDocument)
      deleteFromCloudinary.mockResolvedValue(undefined)

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).toHaveBeenCalledTimes(2)
      expect(deleteFromCloudinary).toHaveBeenCalledWith('seguros/documents/a')
      expect(deleteFromCloudinary).toHaveBeenCalledWith('seguros/documents/b')
    })

    it('still deletes the document even if a Cloudinary cleanup fails', async () => {
      const { deleteFromCloudinary } = jest.requireMock('../../../config/cloudinary') as {
        deleteFromCloudinary: jest.Mock
      }
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findFirst.mockResolvedValueOnce(null) // sin dependientes
      db.documentAttachment.findMany.mockResolvedValue([{ cloudinaryPublicId: 'seguros/documents/a' }])
      db.accountingDocument.delete.mockResolvedValue(fakeDocument)
      deleteFromCloudinary.mockRejectedValue(new Error('Cloudinary down'))

      const res = await request(app)
        .delete(`/api/v1/documents/${DOC_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.delete).toHaveBeenCalled()
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

    it('increases the balance of the linked INVOICE when an ENDORSEMENT with INCREASES_COST is applied', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'END-001', documentType: 'ENDORSEMENT', documentStatus: 'APPLIED', netAmount: 500, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null, economicImpactType: 'INCREASES_COST' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      // originalAmount (1260) + 500 del Endoso aplicado
      expect(res.body.data.effectiveAmount).toBe(1760)
      expect(res.body.data.relatedDocs).toHaveLength(1)
      expect(res.body.data.relatedDocs[0].documentType).toBe('ENDORSEMENT')
    })

    it('decreases the balance of the linked INVOICE when an ENDORSEMENT with DECREASES_COST is applied', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'END-002', documentType: 'ENDORSEMENT', documentStatus: 'APPLIED', netAmount: 300, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null, economicImpactType: 'DECREASES_COST' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      // originalAmount (1260) - 300 del Endoso aplicado
      expect(res.body.data.effectiveAmount).toBe(960)
    })

    it('does not affect the balance of an ENDORSEMENT that is not yet APPLIED', async () => {
      db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([
        { id: OTHER_ID, documentNumber: 'END-003', documentType: 'ENDORSEMENT', documentStatus: 'ISSUED', netAmount: 500, vatAmount: 0, otherTaxesAmount: 0, adjustmentSign: null, economicImpactType: 'INCREASES_COST' },
      ])
      db.documentInstallment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/documents/${DOC_ID}/balance`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.effectiveAmount).toBe(1260)
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

    it('applies a DEBIT_NOTE successfully (generic status flip, no balance check, no eligible installments to redistribute)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID })
      // Sin cuotas elegibles en la factura vinculada → redistributeAdjustmentAcrossInstallments
      // corta temprano (eligible.length === 0) y no toca nada.
      db.documentInstallment.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentType: 'DEBIT_NOTE', documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.accountingDocument.update.mock.calls[0][0].data.documentStatus).toBe('APPLIED')
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
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

    it('returns 409 CONCURRENT_UPDATE when the serializable transaction is aborted by Postgres (P2034)', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 300, vatAmount: 0, otherTaxesAmount: 0 }
      db.accountingDocument.findUnique.mockResolvedValueOnce(creditNote)
      db.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock', {
          code: 'P2034',
          clientVersion: '5.22.0',
        }),
      )

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE')
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
        { policyAssetCoverageId: POLICY_A, allocationPercentage: 40 },
        { policyAssetCoverageId: POLICY_B, allocationPercentage: 60 },
      ])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.documentPolicyAllocation.createMany).toHaveBeenCalledWith({
        data: [
          { policyAssetCoverageId: POLICY_A, allocatedAmount: -40, allocationPercentage: 40, accountingDocumentId: DOC_ID },
          { policyAssetCoverageId: POLICY_B, allocatedAmount: -60, allocationPercentage: 60, accountingDocumentId: DOC_ID },
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

    it('does not overwrite a CREDIT_NOTE that was already distributed manually when applied', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: OTHER_ID, netAmount: 100, vatAmount: 0, otherTaxesAmount: 0 }
      db.accountingDocument.findUnique
        .mockResolvedValueOnce(creditNote)
        .mockResolvedValueOnce(fakeDocument)
      db.accountingDocument.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      // La NC ya tiene sus propias asignaciones (cargadas manualmente al
      // crearla) — apply() no debe pisarlas con el reparto automático.
      db.documentPolicyAllocation.count.mockResolvedValue(2)
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.documentPolicyAllocation.deleteMany).not.toHaveBeenCalled()
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

  // ── Reparto entre cuotas de NC/ND/Ajuste (apply) y reversión (cancel) ───────

  describe('Reparto automático entre cuotas no pagas al aplicar NC/ND/Ajuste', () => {
    const INVOICE_ID = OTHER_ID
    const INST_PAID    = '30000000-0000-0000-0000-000000000001'
    const INST_PENDING_1 = '30000000-0000-0000-0000-000000000002'
    const INST_PENDING_2 = '30000000-0000-0000-0000-000000000003'
    const INST_PENDING_3 = '30000000-0000-0000-0000-000000000004'

    const invoiceFixture = {
      ...fakeDocument,
      id: INVOICE_ID,
      documentType: 'INVOICE',
      documentStatus: 'ISSUED',
      currency: 'ARS',
      exchangeRate: 1,
      netAmount: 4000,
      vatAmount: 0,
      otherTaxesAmount: 0,
      linkedDocumentId: null,
    }

    function installmentRow(id: string, num: number, amount: number, paymentStatus: string) {
      return {
        id,
        accountingDocumentId: INVOICE_ID,
        installmentNumber: num,
        dueDate: BASE_DATE,
        amount,
        amountArs: amount,
        amountUsd: amount,
        currency: 'ARS',
        paymentStatus,
        paymentDate: paymentStatus === 'PAID' ? BASE_DATE : null,
      }
    }

    // Factura con 4 cuotas de $1000: la primera ya PAID, las otras 3 PENDING.
    const paidInstallment = installmentRow(INST_PAID, 1, 1000, 'PAID')
    const pendingInstallments = [
      installmentRow(INST_PENDING_1, 2, 1000, 'PENDING'),
      installmentRow(INST_PENDING_2, 3, 1000, 'PENDING'),
      installmentRow(INST_PENDING_3, 4, 1000, 'PENDING'),
    ]

    function mockFindUniqueByType(sourceDoc: Record<string, unknown>) {
      db.accountingDocument.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === DOC_ID) return Promise.resolve(sourceDoc)
        if (where.id === INVOICE_ID) return Promise.resolve(invoiceFixture)
        return Promise.resolve(null)
      })
    }

    // documentInstallment.findMany se usa con distintos `where` (cuotas
    // pagas para el saldo, cuotas elegibles para el reparto, todas para
    // recalculateDocumentStatus) — discriminamos por el shape del where en
    // vez de encadenar mockResolvedValueOnce, más robusto ante el orden real
    // de llamadas dentro de la transacción.
    function mockEligibleInstallments() {
      db.documentInstallment.findMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.paymentStatus === 'PAID') return Promise.resolve([paidInstallment])
        if (where.paymentStatus && typeof where.paymentStatus === 'object' && (where.paymentStatus as { not?: string }).not === 'PAID') {
          return Promise.resolve(pendingInstallments)
        }
        // recalculateDocumentStatus: sin filtro de paymentStatus, todas las cuotas
        return Promise.resolve([paidInstallment, ...pendingInstallments])
      })
    }

    it("redistributes a CREDIT_NOTE's amount in equal parts across non-PAID installments, remainder to the last, and never touches the PAID one", async () => {
      // Total 100 repartido en 3 cuotas no pagas → -33.33, -33.33, -33.34 (el resto a la última)
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: INVOICE_ID, netAmount: 100, vatAmount: 0, otherTaxesAmount: 0 }
      mockFindUniqueByType(creditNote)
      mockEligibleInstallments()
      db.accountingDocument.findMany.mockResolvedValue([]) // sin otros documentos relacionados a la factura
      db.documentPolicyAllocation.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)

      // Se consulta explícitamente excluyendo las cuotas PAID.
      expect(db.documentInstallment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountingDocumentId: INVOICE_ID, paymentStatus: { not: 'PAID' } },
        }),
      )

      expect(db.documentInstallment.update).toHaveBeenCalledTimes(3)
      const updateCalls = db.documentInstallment.update.mock.calls
      expect(updateCalls.find((c: any) => c[0].where.id === INST_PAID)).toBeUndefined()

      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(966.67, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(966.67, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(966.66, 2)

      // La suma de los deltas debe cerrar exacto contra el monto de la NC (-100).
      const totalDelta = (byId[INST_PENDING_1].amount + byId[INST_PENDING_2].amount + byId[INST_PENDING_3].amount) - 3000
      expect(totalDelta).toBeCloseTo(-100, 2)

      // Las filas de rastreo se insertan en un solo createMany, no una por cuota.
      expect(db.installmentAdjustmentApplication.createMany).toHaveBeenCalledTimes(1)
      expect(db.installmentAdjustmentApplication.createMany.mock.calls[0][0].data).toHaveLength(3)
    })

    it('applies a DEBIT_NOTE and adds its amount (positive) to the eligible installments', async () => {
      const debitNote = { ...fakeDocument, documentType: 'DEBIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: INVOICE_ID, netAmount: 300, vatAmount: 0, otherTaxesAmount: 0 }
      mockFindUniqueByType(debitNote)
      mockEligibleInstallments()
      db.accountingDocument.update.mockResolvedValue({ ...debitNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const updateCalls = db.documentInstallment.update.mock.calls
      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      // 300 repartido en 3 cuotas de $1000 c/u → +100 cada una
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(1100, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(1100, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(1100, 2)
    })

    it('applies a NEGATIVE ADJUSTMENT_ENTRY and subtracts its amount from the eligible installments', async () => {
      const adjustment = {
        ...fakeDocument,
        documentType: 'ADJUSTMENT_ENTRY',
        documentStatus: 'ISSUED',
        linkedDocumentId: INVOICE_ID,
        netAmount: 300,
        vatAmount: 0,
        otherTaxesAmount: 0,
        adjustmentSign: 'NEGATIVE',
      }
      mockFindUniqueByType(adjustment)
      mockEligibleInstallments()
      db.accountingDocument.update.mockResolvedValue({ ...adjustment, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const updateCalls = db.documentInstallment.update.mock.calls
      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(900, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(900, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(900, 2)
    })

    it('applies an ENDORSEMENT with INCREASES_COST and adds its amount to the eligible installments of the linked invoice', async () => {
      const endorsement = {
        ...fakeDocument,
        documentType: 'ENDORSEMENT',
        documentStatus: 'ISSUED',
        linkedDocumentId: INVOICE_ID,
        netAmount: 300,
        vatAmount: 0,
        otherTaxesAmount: 0,
        economicImpactType: 'INCREASES_COST',
      }
      mockFindUniqueByType(endorsement)
      mockEligibleInstallments()
      db.accountingDocument.update.mockResolvedValue({ ...endorsement, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const updateCalls = db.documentInstallment.update.mock.calls
      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(1100, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(1100, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(1100, 2)
    })

    it('applies an ENDORSEMENT with DECREASES_COST and subtracts its amount from the eligible installments of the linked invoice', async () => {
      const endorsement = {
        ...fakeDocument,
        documentType: 'ENDORSEMENT',
        documentStatus: 'ISSUED',
        linkedDocumentId: INVOICE_ID,
        netAmount: 300,
        vatAmount: 0,
        otherTaxesAmount: 0,
        economicImpactType: 'DECREASES_COST',
      }
      mockFindUniqueByType(endorsement)
      mockEligibleInstallments()
      db.accountingDocument.update.mockResolvedValue({ ...endorsement, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const updateCalls = db.documentInstallment.update.mock.calls
      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(900, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(900, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(900, 2)
    })

    it('does not modify any installment when the linked invoice has none eligible (all already PAID)', async () => {
      const creditNote = { ...fakeDocument, documentType: 'CREDIT_NOTE', documentStatus: 'ISSUED', linkedDocumentId: INVOICE_ID, netAmount: 100, vatAmount: 0, otherTaxesAmount: 0 }
      mockFindUniqueByType(creditNote)
      db.accountingDocument.findMany.mockResolvedValue([])
      db.documentPolicyAllocation.findMany.mockResolvedValue([])
      // Ninguna cuota elegible (todas ya pagas) → eligible.length === 0
      db.documentInstallment.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'APPLIED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/apply`)
        .set('Authorization', `Bearer ${adminToken()}`)

      // Se permite aplicar igual, sin tocar ninguna cuota.
      expect(res.status).toBe(200)
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
      expect(db.installmentAdjustmentApplication.createMany).not.toHaveBeenCalled()
    })

    it('reverses the installment amounts exactly when an APPLIED CREDIT_NOTE that redistributed is cancelled', async () => {
      const creditNote = { ...fakeDocument, id: DOC_ID, documentType: 'CREDIT_NOTE', documentStatus: 'APPLIED', linkedDocumentId: INVOICE_ID }

      db.accountingDocument.findUnique.mockResolvedValue(creditNote)
      // Reparto previamente aplicado: -33.33 / -33.33 / -33.34 sobre cuotas que hoy están en 966.67/966.67/966.66
      db.installmentAdjustmentApplication.findMany.mockResolvedValue([
        {
          id: 'a1', installmentId: INST_PENDING_1, sourceDocumentId: DOC_ID,
          deltaAmount: -33.33, deltaAmountArs: -33.33, deltaAmountUsd: -33.33,
          installment: { ...installmentRow(INST_PENDING_1, 2, 966.67, 'PENDING'), document: { currency: 'ARS', exchangeRate: 1 } },
        },
        {
          id: 'a2', installmentId: INST_PENDING_2, sourceDocumentId: DOC_ID,
          deltaAmount: -33.33, deltaAmountArs: -33.33, deltaAmountUsd: -33.33,
          installment: { ...installmentRow(INST_PENDING_2, 3, 966.67, 'PENDING'), document: { currency: 'ARS', exchangeRate: 1 } },
        },
        {
          id: 'a3', installmentId: INST_PENDING_3, sourceDocumentId: DOC_ID,
          deltaAmount: -33.34, deltaAmountArs: -33.34, deltaAmountUsd: -33.34,
          installment: { ...installmentRow(INST_PENDING_3, 4, 966.66, 'PENDING'), document: { currency: 'ARS', exchangeRate: 1 } },
        },
      ])
      db.documentInstallment.findMany.mockResolvedValue([paidInstallment, ...pendingInstallments])
      db.accountingDocument.update.mockResolvedValue({ ...creditNote, documentStatus: 'CANCELLED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)

      const updateCalls = db.documentInstallment.update.mock.calls
      const byId = Object.fromEntries(updateCalls.map((c: any) => [c[0].where.id, c[0].data]))
      // amount - deltaAmount vuelve exactamente a $1000 en las 3 cuotas
      expect(byId[INST_PENDING_1].amount).toBeCloseTo(1000, 2)
      expect(byId[INST_PENDING_2].amount).toBeCloseTo(1000, 2)
      expect(byId[INST_PENDING_3].amount).toBeCloseTo(1000, 2)
      expect(byId[INST_PAID]).toBeUndefined()

      expect(db.installmentAdjustmentApplication.deleteMany).toHaveBeenCalledWith({ where: { sourceDocumentId: DOC_ID } })
    })

    it('does nothing when cancelling a document that never redistributed anything (no tracking rows)', async () => {
      db.accountingDocument.findUnique.mockResolvedValue({ ...fakeDocument, documentStatus: 'ISSUED' })
      db.installmentAdjustmentApplication.findMany.mockResolvedValue([])
      db.accountingDocument.update.mockResolvedValue({ ...fakeDocument, documentStatus: 'CANCELLED', installments: [], allocations: [], attachments: [] })

      const res = await request(app)
        .post(`/api/v1/documents/${DOC_ID}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.documentInstallment.update).not.toHaveBeenCalled()
      expect(db.installmentAdjustmentApplication.deleteMany).not.toHaveBeenCalled()
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
