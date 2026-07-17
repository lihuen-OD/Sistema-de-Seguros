import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser, ADMIN_USER_ID } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    accountingDocument: { findUnique: jest.fn() },
    policy: { findMany: jest.fn() },
    asset: { findMany: jest.fn() },
  },
}))

jest.mock('../../email/email.service', () => ({
  emailService: { sendManualEntityEmail: jest.fn() },
}))

import { prisma } from '../../../config/database'
import { emailService } from '../../email/email.service'

const db = prisma as any
const mockedEmailService = emailService as jest.Mocked<typeof emailService>

const DOC_ID = '60000000-0000-0000-0000-000000000001'
const BASE_DATE = new Date('2026-07-01T00:00:00.000Z')

const fakeDocument = {
  id: DOC_ID,
  documentNumber: 'A-0001-00012345',
  documentType: 'INVOICE',
  documentStatus: 'ISSUED',
  issueDate: BASE_DATE,
  netAmount: 100000,
  vatAmount: 21000,
  otherTaxesAmount: 0,
  currency: 'ARS',
  exchangeRate: 1,
  description: null,
  paymentStatus: 'PENDING',
  insuranceCompany: 'La Segunda',
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
  allocations: [
    {
      id: 'alloc-1',
      accountingDocumentId: DOC_ID,
      policyId: 'policy-1',
      allocatedAmount: 100000,
      allocationPercentage: 100,
      policy: { id: 'policy-1', policyNumber: 'POL-001', insuredName: 'Cliente Test' },
    },
  ],
  attachments: [
    { id: 'att-1', name: 'ficha-activo.pdf', fileUrl: 'local://ficha-activo.pdf' },
  ],
}

const fakePolicyAssetIds = [{ id: 'policy-1', assetIds: ['asset-1'] }]

const fakeAssetWithCostCenter = [
  {
    id: 'asset-1',
    code: 'VEH-001',
    name: 'Camión Scania R450',
    assetType: 'vehiculo',
    fixedAssetCode: 'BU-000002',
    allocations: [{ costCenter: { id: 'cc-1', name: 'Logística y Transporte', code: 'LOG-001' } }],
  },
]

describe('POST /api/v1/documents/:id/send-email', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.accountingDocument.findUnique.mockResolvedValue(fakeDocument)
    db.policy.findMany.mockResolvedValue(fakePolicyAssetIds)
    db.asset.findMany.mockResolvedValue(fakeAssetWithCostCenter)
    mockedEmailService.sendManualEntityEmail.mockResolvedValue({
      sent: true,
      status: 'SENT',
      to: ['destinatario@empresa.com'],
    })
  })

  it('envía el mail delegando en emailService con datos armados en el backend', async () => {
    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ to: ['destinatario@empresa.com'], subject: 'Asunto custom' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ sent: true, status: 'SENT', to: ['destinatario@empresa.com'] })

    expect(mockedEmailService.sendManualEntityEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'AccountingDocument',
        entityId: DOC_ID,
        to: ['destinatario@empresa.com'],
        subjectOverride: 'Asunto custom',
        actor: { userId: ADMIN_USER_ID, email: 'test@losodwyer.com' },
        templateData: expect.objectContaining({
          documentTypeLabel: 'Factura',
          documentNumber: 'A-0001-00012345',
          insuranceCompany: 'La Segunda',
          paymentMethod: 'Transferencia bancaria',
          assets: [
            expect.objectContaining({
              code: 'BU-000002',
              name: 'Camión Scania R450',
              amount: 100000,
              percentage: 100,
            }),
          ],
          costCenters: [
            expect.objectContaining({
              code: 'LOG-001',
              name: 'Logística y Transporte',
              amount: 100000,
              percentage: 100,
            }),
          ],
          // El adjunto usa fileUrl 'local://...' (sin Cloudinary configurado) —
          // no hay archivo real para bajar, así que no se adjunta ni se linkea.
          attachments: [{ name: 'ficha-activo.pdf', fileUrl: null, attached: false }],
        }),
      }),
    )

    expect(db.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['policy-1'] } } }),
    )
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['asset-1'] } } }),
    )
  })

  it('rechaza destinatarios inválidos con 422 y no llega a llamar a emailService', async () => {
    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ to: ['no-es-un-email'] })

    expect(res.status).toBe(422)
    expect(mockedEmailService.sendManualEntityEmail).not.toHaveBeenCalled()
  })

  it('devuelve 403 para un usuario sin el módulo documents', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ to: ['destinatario@empresa.com'] })

    expect(res.status).toBe(403)
  })

  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .send({ to: ['destinatario@empresa.com'] })

    expect(res.status).toBe(401)
  })

  it('devuelve 404 si el documento no existe', async () => {
    db.accountingDocument.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ to: ['destinatario@empresa.com'] })

    expect(res.status).toBe(404)
    expect(mockedEmailService.sendManualEntityEmail).not.toHaveBeenCalled()
  })
})
