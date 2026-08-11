import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findMany: jest.fn() },
    fireExtinguisher: { findMany: jest.fn() },
    documentInstallment: { findMany: jest.fn() },
    assetAttachment: { findMany: jest.fn() },
    insuranceAudit: { findMany: jest.fn() },
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
  return {
    id,
    policyNumber: `POL-${id}`,
    insuredName: 'Cliente Test',
    endDate,
    // La empresa ya no vive en la póliza — se resuelve por línea de
    // cobertura (companyId directo, o vía el activo cubierto).
    coverages: [{ company: { name: 'La Segunda' }, asset: null }],
  }
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

function fakePendingCardAudit(id: string, requestedAt = daysFromNow(-1)) {
  return {
    id,
    cardUpdateRequestedAt: requestedAt,
    auditDate: requestedAt,
    asset: { id: `asset-${id}`, name: 'Camioneta Hilux', code: `ROD-${id}` },
  }
}

// Setup común: sin descartes previos, salvo que un test los sobreescriba.
beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.insuranceAudit.findMany.mockResolvedValue([])
  db.notificationDismissal.findMany.mockResolvedValue([])
})

describe('Notifications API', () => {
  // Agrega datos de varios módulos (pólizas, cuotas, matafuegos, documentos,
  // activos) — cualquier usuario autenticado entra, pero cada ítem se filtra
  // según los módulos que ya tiene habilitados (ADMIN ve todo, sin filtrar).
  describe('filtrado por módulo para usuarios no-ADMIN', () => {
    function mockAllCategories() {
      db.policy.findMany.mockResolvedValue([fakePolicy('1')])
      db.fireExtinguisher.findMany.mockResolvedValue([fakeExtinguisher('1')])
      db.documentInstallment.findMany
        .mockResolvedValueOnce([fakeInstallment('o1', daysFromNow(-3))])
        .mockResolvedValueOnce([fakeInstallment('n1', daysFromNow(3))])
      db.assetAttachment.findMany.mockResolvedValue([fakeAssetAttachment('1')])
    }

    it('a USER con solo el módulo policies le llegan únicamente notificaciones de category policy', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['policies'] }))
      mockAllCategories()

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      const categories = (res.body.data as any[]).map((i) => i.category)
      expect(categories).toEqual(['policy'])
    })

    it('a USER con solo el módulo documents le llegan las dos categorías de cuotas, no pólizas/matafuegos/activos', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['documents'] }))
      mockAllCategories()

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      const categories = (res.body.data as any[]).map((i) => i.category).sort()
      expect(categories).toEqual(['installment_near', 'installment_overdue'])
    })

    it('a USER sin ninguno de los módulos relevantes no le llega ninguna notificación (200 con lista vacía, no 403)', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['producers', 'tasks'] }))
      mockAllCategories()

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('el preview de la campanita respeta el mismo filtro por módulo', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['fire_extinguishers'] }))
      mockAllCategories()

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        expiringPolicies: 0,
        expiringExtinguishers: 1,
        overdueInstallments: 0,
        nearInstallments: 0,
        expiringAttachments: 0,
        pendingCardUpdates: 0,
        hasAlerts: true,
      })
    })

    it('a USER con el módulo insurance_audits le llega el aviso de tarjeta pendiente', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))
      mockAllCategories()
      db.insuranceAudit.findMany.mockResolvedValue([fakePendingCardAudit('1')])

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      const categories = (res.body.data as any[]).map((i) => i.category)
      expect(categories).toEqual(['insurance_card_pending'])
    })

    it('ADMIN sigue viendo todas las categorías sin filtrar', async () => {
      mockAllCategories()

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const categories = (res.body.data as any[]).map((i) => i.category).sort()
      expect(categories).toEqual(
        ['asset_attachment', 'fire_extinguisher', 'installment_near', 'installment_overdue', 'policy'].sort(),
      )
    })
  })

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

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        expiringPolicies: 2,
        expiringExtinguishers: 1,
        overdueInstallments: 3,
        nearInstallments: 0,
        expiringAttachments: 1,
        pendingCardUpdates: 0,
        hasAlerts: true,
      })
    })

    it('cuenta los avisos de tarjeta pendiente', async () => {
      db.policy.findMany.mockResolvedValue([])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.insuranceAudit.findMany.mockResolvedValue([fakePendingCardAudit('1'), fakePendingCardAudit('2')])

      const res = await request(app)
        .get('/api/v1/notifications/preview')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.pendingCardUpdates).toBe(2)
      expect(res.body.data.hasAlerts).toBe(true)
    })

    it('hasAlerts es false cuando todos los conteos son cero', async () => {
      db.policy.findMany.mockResolvedValue([])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])

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
          coverages: [{ company: { name: 'La Segunda' }, asset: null }],
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

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const items = res.body.data as any[]
      expect(items).toHaveLength(5)
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

      // Ordenado por dueDate ascendente — el más vencido primero
      const dueDates = items.map((i) => i.dueDate)
      expect(dueDates).toEqual([...dueDates].sort())
    })

    it('mapea el aviso de tarjeta pendiente con título, subtítulo y entityType propios', async () => {
      db.policy.findMany.mockResolvedValue([])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
      db.insuranceAudit.findMany.mockResolvedValue([fakePendingCardAudit('70000000-0000-0000-0000-000000000001')])

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0]).toMatchObject({
        category: 'insurance_card_pending',
        title: 'ROD-70000000-0000-0000-0000-000000000001 — Camioneta Hilux',
        subtitle: 'El auditor avisó que ya colocó la tarjeta de circulación',
        entityType: 'InsuranceAudit',
        entityId: '70000000-0000-0000-0000-000000000001',
      })
    })

    it('marca un ítem como reviewed cuando coincide con un descarte del usuario', async () => {
      const policy = fakePolicy('1')
      db.policy.findMany.mockResolvedValue([policy])
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.documentInstallment.findMany.mockResolvedValue([])
      db.assetAttachment.findMany.mockResolvedValue([])
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

    // "Revisado" es un estado compartido (no por usuario) — solo el ADMIN
    // puede gestionarlo, para que un usuario común no le haga desaparecer a
    // todos (incluido el propio ADMIN) algo que todavía nadie vio.
    it('returns 403 for a non-admin USER, aunque tenga el módulo policies', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['policies'] }))

      const res = await request(app)
        .post('/api/v1/notifications/review')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ items: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }] })

      expect(res.status).toBe(403)
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
    it('returns 403 for a non-admin USER, aunque tenga el módulo policies', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['policies'] }))

      const res = await request(app)
        .post('/api/v1/notifications/unreview')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ items: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }] })

      expect(res.status).toBe(403)
    })

    it('elimina el descarte de los ítems enviados, sin acotar por quién lo había revisado', async () => {
      db.notificationDismissal.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post('/api/v1/notifications/unreview')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ items: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }] })

      expect(res.status).toBe(200)
      // Sin `userId` en el where — si otro ADMIN lo había revisado, este
      // ADMIN igual tiene que poder desmarcarlo (estado compartido).
      expect(db.notificationDismissal.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ notificationId: 'policy:1', dueDate: '2026-08-01' }] },
      })
    })
  })
})
