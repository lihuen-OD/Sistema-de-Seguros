import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser, ADMIN_USER_ID } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    accountingDocument: { findUnique: jest.fn() },
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
  // Cada asignación ya apunta a una línea de cobertura (póliza + activo) — el
  // peso (allocatedAmount/allocationPercentage) es el real de esa línea, no
  // un reparto parejo entre los activos de la póliza.
  allocations: [
    {
      id: 'alloc-1',
      accountingDocumentId: DOC_ID,
      policyAssetCoverageId: 'coverage-1',
      allocatedAmount: 100000,
      allocationPercentage: 100,
      policyAssetCoverage: {
        policyId: 'policy-1',
        assetId: 'asset-1',
        policy: { id: 'policy-1', policyNumber: 'POL-001', insuredName: 'Cliente Test' },
        asset: { id: 'asset-1', name: 'Camión Scania R450', code: 'VEH-001', fixedAssetCode: 'BU-000002' },
      },
    },
  ],
  attachments: [
    { id: 'att-1', name: 'ficha-activo.pdf', fileUrl: 'local://ficha-activo.pdf' },
  ],
}

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

    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['asset-1'] } } }),
    )
  })

  it('reparte el importe real de cada línea — no en partes iguales — cuando una póliza cubre varios activos', async () => {
    const multiAssetDoc = {
      ...fakeDocument,
      allocations: [
        {
          id: 'alloc-1',
          accountingDocumentId: DOC_ID,
          policyAssetCoverageId: 'coverage-1',
          allocatedAmount: 60000,
          allocationPercentage: 60,
          policyAssetCoverage: {
            policyId: 'policy-1',
            assetId: 'asset-1',
            policy: { id: 'policy-1', policyNumber: 'POL-001', insuredName: 'Cliente Test' },
            asset: { id: 'asset-1', name: 'Camión Scania R450', code: 'VEH-001', fixedAssetCode: 'BU-000002' },
          },
        },
        {
          id: 'alloc-2',
          accountingDocumentId: DOC_ID,
          policyAssetCoverageId: 'coverage-2',
          allocatedAmount: 40000,
          allocationPercentage: 40,
          policyAssetCoverage: {
            policyId: 'policy-1',
            assetId: 'asset-2',
            policy: { id: 'policy-1', policyNumber: 'POL-001', insuredName: 'Cliente Test' },
            asset: { id: 'asset-2', name: 'Toyota Hilux', code: 'VEH-002', fixedAssetCode: 'BU-000003' },
          },
        },
      ],
    }
    db.accountingDocument.findUnique.mockResolvedValue(multiAssetDoc)
    db.asset.findMany.mockResolvedValue([
      ...fakeAssetWithCostCenter,
      {
        id: 'asset-2',
        code: 'VEH-002',
        name: 'Toyota Hilux',
        assetType: 'vehiculo',
        fixedAssetCode: 'BU-000003',
        allocations: [{ costCenter: { id: 'cc-1', name: 'Logística y Transporte', code: 'LOG-001' } }],
      },
    ])

    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/send-email`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ to: ['destinatario@empresa.com'] })

    expect(res.status).toBe(200)
    const { templateData } = mockedEmailService.sendManualEntityEmail.mock.calls[0][0] as any
    expect(templateData.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BU-000002', amount: 60000, percentage: 60 }),
        expect.objectContaining({ code: 'BU-000003', amount: 40000, percentage: 40 }),
      ]),
    )
    // Ambos activos comparten centro de costo — el desglose por CC los suma.
    expect(templateData.costCenters).toEqual([
      expect.objectContaining({ code: 'LOG-001', amount: 100000, percentage: 100 }),
    ])
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
