import request from 'supertest'
import { app } from '../../../app'
import { adminToken } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    policy: { count: jest.fn(), findMany: jest.fn() },
    fireExtinguisher: { count: jest.fn(), findMany: jest.fn() },
    documentInstallment: { count: jest.fn(), findMany: jest.fn() },
    assetAttachment: { count: jest.fn(), findMany: jest.fn() },
    policyAttachment: { count: jest.fn(), findMany: jest.fn() },
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

describe('Notifications API', () => {
  describe('GET /api/v1/notifications/preview', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/notifications/preview')
      expect(res.status).toBe(401)
    })

    it('returns the 5 counts and hasAlerts', async () => {
      db.policy.count.mockResolvedValue(2)
      db.fireExtinguisher.count.mockResolvedValue(1)
      db.documentInstallment.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0)
      db.assetAttachment.count.mockResolvedValue(1)
      db.policyAttachment.count.mockResolvedValue(1)

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
      db.policy.count.mockResolvedValue(0)
      db.fireExtinguisher.count.mockResolvedValue(0)
      db.documentInstallment.count.mockResolvedValue(0)
      db.assetAttachment.count.mockResolvedValue(0)
      db.policyAttachment.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
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
  })
})
