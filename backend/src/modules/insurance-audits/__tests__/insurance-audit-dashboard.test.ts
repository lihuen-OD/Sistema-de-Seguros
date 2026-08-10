import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    asset: { findMany: jest.fn() },
    insuranceAudit: { findMany: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const PERIOD = '2026-08'

describe('GET /api/v1/insurance-audits/audit-dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.asset.findMany.mockResolvedValue([])
    db.insuranceAudit.findMany.mockResolvedValue([])
  })

  it('groups coverage and circulation-card compliance by category', async () => {
    db.asset.findMany.mockResolvedValue([
      { id: 'a1', assetType: 'Camioneta' },
      { id: 'a2', assetType: 'Camioneta' },
      { id: 'a3', assetType: 'Tractor' },
    ])
    db.insuranceAudit.findMany.mockResolvedValue([
      { assetId: 'a1', hasCirculationCard: true, auditDate: new Date('2026-08-10') },
      { assetId: 'a2', hasCirculationCard: false, auditDate: new Date('2026-08-11') },
    ])

    const res = await request(app)
      .get('/api/v1/insurance-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.totalRegistered).toBe(3)
    expect(res.body.data.totalAudited).toBe(2)
    const camioneta = res.body.data.categories.find((c: any) => c.category === 'camioneta')
    expect(camioneta).toMatchObject({
      total: 2,
      audited: 2,
      pending: 0,
      percentAudited: 100,
      withCirculationCard: 1,
      withoutCirculationCard: 1,
    })
    const tractor = res.body.data.categories.find((c: any) => c.category === 'tractor')
    expect(tractor).toMatchObject({ total: 1, audited: 0, pending: 1, percentAudited: 0 })
  })

  it('returns 403 for a USER without the insurance_audit_dashboard module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/insurance-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/insurance-audits/auditor-progress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.user.findMany.mockResolvedValue([])
    db.asset.findMany.mockResolvedValue([])
    db.insuranceAudit.findMany.mockResolvedValue([])
  })

  it('counts assigned/completed/pending only within the assets assigned to each auditor', async () => {
    db.user.findMany.mockResolvedValue([
      { id: 'u1', name: 'Esteban', email: 'esteban@losodwyer.com', auditScopes: [{ scopeValue: 'a1' }, { scopeValue: 'a2' }] },
    ])
    db.asset.findMany.mockResolvedValue([
      { id: 'a1', assetType: 'Camioneta' },
      { id: 'a2', assetType: 'Camioneta' },
      { id: 'a3', assetType: 'Tractor' },
    ])
    db.insuranceAudit.findMany.mockResolvedValue([{ assetId: 'a1', auditedBy: 'esteban@losodwyer.com', auditDate: new Date('2026-08-10') }])

    const res = await request(app)
      .get('/api/v1/insurance-audits/auditor-progress')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.auditors[0]).toMatchObject({ assigned: 2, completed: 1, pending: 1, completionRate: 50 })
  })

  it('returns 403 for a USER without the insurance_audits module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))

    const res = await request(app)
      .get('/api/v1/insurance-audits/auditor-progress')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
  })
})
