import request from 'supertest'
import { app } from '../../../app'
import { adminToken } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    policy: { findMany: jest.fn() },
    fireExtinguisher: { findMany: jest.fn() },
    documentInstallment: { findMany: jest.fn() },
    assetAttachment: { findMany: jest.fn() },
    policyAttachment: { findMany: jest.fn() },
    notificationDismissal: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'

const db = prisma as any

function daysFromNow(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function fakePolicy(id: string, endDate = daysFromNow(20)) {
  return { id, policyNumber: `POL-${id}`, insuredName: 'Cliente Test', endDate, company: { name: 'La Segunda' } }
}

function fakeExtinguisher(id: string, expirationDate = daysFromNow(-5)) {
  return {
    id,
    code: `MAT-${id}`,
    location: 'Planta Baja',
    locationType: 'Edificio',
    expirationDate,
    manufacturingYear: null,
    hydraulicTestExpirationDate: null,
  }
}

function fakeInstallment(id: string, dueDate: Date) {
  return {
    id,
    installmentNumber: 1,
    dueDate,
    document: { id: `doc-${id}`, documentNumber: `A-${id}`, insuranceCompany: 'La Segunda' },
  }
}

function fakeAssetAttachment(id: string, expirationDate = daysFromNow(10)) {
  return { id, name: `${id}.pdf`, expirationDate, asset: { id: `asset-${id}`, name: 'Toyota Hilux' } }
}

function fakePolicyAttachment(id: string, expirationDate = daysFromNow(-1)) {
  return { id, name: `${id}.pdf`, expirationDate, policy: { id: `policy-${id}`, policyNumber: `POL-${id}` } }
}

// Setup común: sin descartes previos, salvo que un test los sobreescriba.
beforeEach(() => {
  db.notificationDismissal.findMany.mockResolvedValue([])
})

describe('Notifications API', () => {
  describe('GET /api/v1/notifications/preview', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/notifications/preview')
      expect(res.status).toBe(401)
    })

    it('returns the 5 counts and hasAlerts', async () => {
      db.policy.findMany.mockResolvedValue([fakePolicy('1'), fakePolicy('2')])
      db.fireExtinguisher.findMany.mockResolvedValue([fakeExtinguisher('1')])
      db.documentInstallment.findMany
        .mockResolvedValueOnce([
          fakeInstallment('o1', daysFromNow(-3)),
          fakeInstallment('o2', daysFromNow(-2)),
          fakeInstallment('o3', daysFromNow(-1)),
        ])
        .mockResolvedValueOnce([])
      db.assetAttachment.findMany.mockResolvedValue([fakeAssetAttachment('1')])
      db.policyAttachment.findMany.mockResolvedValue([fakePolicyAttachment('1')])

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        expiringPolicies: 2,
        expiringExtinguishers: 1,
        overdueInstallments: 3,
        nearInstallments: 0,
        expiringAttachments: 2, // 1 asset + 1 policy
        hasAlerts: true,
      })
    })

    it('hasAlerts es false cuando todos los conteos son cero', async () => {
      db.policy.findMany.mockResolvedValue([])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.policyAttachment.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.hasAlerts).toBe(false)
    })

    it('no cuenta un ítem ya revisado por el usuario actual', async () => {
      const policy = fakePolicy('1')
      db.policy.findMany.mockResolvedValue([policy])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.policyAttachment.findMany.mockResolvedValue([])
      db.notificationDismissal.findMany.mockResolvedValue([
        { notificationId: 'policy:1', dueDate: policy.endDate.toISOString().slice(0, 10) },
      ])

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.expiringPolicies).toBe(0)
      expect(res.body.data.hasAlerts).toBe(false)
    })
  })

  describe('GET /api/v1/notifications', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/notifications')
      expect(res.status).toBe(401)
    })

    it('arma la lista itemizada con severity/entityType/entityId correctos, ordenada por vencimiento', async () => {
      db.policy.findMany.mockResolvedValue([
        {
          id: 'policy-1',
          policyNumber: 'POL-001',
          insuredName: 'Cliente Test',
          endDate: daysFromNow(20),
          company: { name: 'La Segunda' },
        },
      ])
      db.fireExtinguisher.findMany.mockResolvedValue([
        {
          id: 'fe-1',
          code: 'MAT-001-A',
          location: 'Planta Baja',
          locationType: 'Edificio',
          expirationDate: daysFromNow(-5),
          manufacturingYear: null,
          hydraulicTestExpirationDate: null,
        },
      ])
      db.documentInstallment.findMany
        .mockResolvedValueOnce([
          {
            id: 'inst-overdue-1',
            installmentNumber: 1,
            dueDate: daysFromNow(-3),
            document: { id: 'doc-1', documentNumber: 'A-001', insuranceCompany: 'La Segunda' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'inst-near-1',
            installmentNumber: 2,
            dueDate: daysFromNow(3),
            document: { id: 'doc-2', documentNumber: 'A-002', insuranceCompany: 'Sancor' },
          },
        ])
      db.assetAttachment.findMany.mockResolvedValue([
        {
          id: 'att-asset-1',
          name: 'VTV.pdf',
          expirationDate: daysFromNow(10),
          asset: { id: 'asset-1', name: 'Toyota Hilux' },
        },
      ])
      db.policyAttachment.findMany.mockResolvedValue([
        {
          id: 'att-policy-1',
          name: 'endoso.pdf',
          expirationDate: daysFromNow(-1),
          policy: { id: 'policy-2', policyNumber: 'POL-002' },
        },
      ])

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const items = res.body.data as any[]
      expect(items).toHaveLength(6)
      expect(items.every((i) => i.reviewed === false)).toBe(true)

      const byCategory = Object.fromEntries(items.map((i) => [i.category, i]))

      expect(byCategory.policy).toMatchObject({
        severity: 'proximo_vencer',
        title: 'POL-001 — Cliente Test',
        subtitle: 'La Segunda',
        entityType: 'Policy',
        entityId: 'policy-1',
      })
      expect(byCategory.fire_extinguisher).toMatchObject({
        severity: 'vencido',
        title: 'MAT-001-A',
        entityType: 'FireExtinguisher',
        entityId: 'fe-1',
      })
      expect(byCategory.installment_overdue).toMatchObject({
        severity: 'vencido',
        title: 'Cuota #1 — A-001',
        entityType: 'AccountingDocument',
        entityId: 'doc-1',
      })
      expect(byCategory.installment_near).toMatchObject({
        severity: 'proximo_vencer',
        title: 'Cuota #2 — A-002',
        entityType: 'AccountingDocument',
        entityId: 'doc-2',
      })
      expect(byCategory.asset_attachment).toMatchObject({
        severity: 'proximo_vencer',
        title: 'VTV.pdf',
        subtitle: 'Activo: Toyota Hilux',
        entityType: 'Asset',
        entityId: 'asset-1',
      })
      expect(byCategory.policy_attachment).toMatchObject({
        severity: 'vencido',
        title: 'endoso.pdf',
        subtitle: 'Póliza: POL-002',
        entityType: 'Policy',
        entityId: 'policy-2',
      })

      // Ordenado por dueDate ascendente — el más vencido primero
      const dueDates = items.map((i) => i.dueDate)
      expect(dueDates).toEqual([...dueDates].sort())
    })

    it('marca un ítem como reviewed cuando coincide con un descarte del usuario', async () => {
      const policy = fakePolicy('1')
      db.policy.findMany.mockResolvedValue([policy])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.policyAttachment.findMany.mockResolvedValue([])
      const dueDateStr = policy.endDate.toISOString().slice(0, 10)
      db.notificationDismissal.findMany.mockResolvedValue([
        { notificationId: 'policy:1', dueDate: dueDateStr },
      ])

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].reviewed).toBe(true)
    })

    it('no considera reviewed un descarte con una dueDate distinta (ej. la póliza se renovó)', async () => {
      const policy = fakePolicy('1', daysFromNow(20))
      db.policy.findMany.mockResolvedValue([policy])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.policyAttachment.findMany.mockResolvedValue([])
      // Descarte guardado para un vencimiento viejo, distinto al actual.
      db.notificationDismissal.findMany.mockResolvedValue([
        { notificationId: 'policy:1', dueDate: daysFromNow(-100).toISOString().slice(0, 10) },
      ])

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data[0].reviewed).toBe(false)
    })
  })

  describe('POST /api/v1/notifications/review', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/v1/notifications/review').send({ items: [] })
      expect(res.status).toBe(401)
    })

    it('marca los ítems enviados como revisados (createMany con skipDuplicates)', async () => {
      db.notificationDismissal.createMany.mockResolvedValue({ count: 2 })

      const res = await request(app)
        .post('/api/v1/notifications/review')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }, { notificationId: 'fire_extinguisher:2', dueDate: '2026-07-01' }] })

      expect(res.status).toBe(200)
      expect(db.notificationDismissal.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      )
    })

    it('returns 422 when items is empty', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/review')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [] })

      expect(res.status).toBe(422)
    })
  })

  describe('POST /api/v1/notifications/unreview', () => {
    it('elimina el descarte de los ítems enviados', async () => {
      db.notificationDismissal.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post('/api/v1/notifications/unreview')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }] })

      expect(res.status).toBe(200)
      expect(db.notificationDismissal.deleteMany).toHaveBeenCalled()
    })
  })
})
