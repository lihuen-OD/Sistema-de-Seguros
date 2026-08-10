import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// "Auditoría de Activos" reutiliza el motor de fire-extinguisher-audits
// (población ASSET) — ver fire-extinguisher-audits.population.ts. Estos
// tests cubren específicamente lo que es distinto de la población
// ESTABLISHMENT (ya cubierta en fire-extinguisher-audits.test.ts): la
// inclusión/exclusión por vínculo a vehículo/maquinaria, el alcance por
// categoría, y el aislamiento operativo entre las dos colas.

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    fireExtinguisher: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    fireExtinguisherAudit: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    fireExtinguisherAuditProposedChange: {
      create: jest.fn(),
    },
    auditComment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userAuditScope: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const BASE_DATE = new Date('2026-07-06T00:00:00.000Z')
const TRACTOR_FE_ID = '60000000-0000-0000-0000-000000000010'
const BUILDING_FE_ID = '60000000-0000-0000-0000-000000000011'
const ASSET_AUDIT_ID = '70000000-0000-0000-0000-000000000010'
const ESTABLISHMENT_AUDIT_ID = '70000000-0000-0000-0000-000000000011'

const fakeTractorFe = {
  id: TRACTOR_FE_ID,
  cylinderNumber: 'CIL-010',
  expirationDate: new Date('2027-01-01T00:00:00.000Z'),
  capacity: '10 kg',
  type: 'Polvo seco ABC',
  brand: 'Cesa',
  iramCertificateNumber: 'IRAM-777',
  location: 'Cabina',
  establishment: null,
  isActive: true,
  assetId: 'a0000000-0000-0000-0000-000000000001',
  // `fireExtinguisherAuditable` es el tilde del Activo específico de esta
  // auditoría (independiente del de Auditoría de Seguros) — un vehículo con
  // matafuego pero sin este tilde queda afuera de Rodados (ver los tests de
  // exclusión más abajo).
  asset: { assetType: 'Tractor', fireExtinguisherAuditable: true },
}

const fakeNonAuditableTractorFe = {
  ...fakeTractorFe,
  id: '60000000-0000-0000-0000-000000000012',
  asset: { assetType: 'Tractor', fireExtinguisherAuditable: false },
}

const fakeBuildingFe = {
  id: BUILDING_FE_ID,
  cylinderNumber: 'CIL-011',
  expirationDate: new Date('2027-01-01T00:00:00.000Z'),
  capacity: '10 kg',
  type: 'Polvo seco ABC',
  brand: 'Cesa',
  iramCertificateNumber: 'IRAM-778',
  location: 'Planta baja',
  establishment: 'PLANTA',
  isActive: true,
  assetId: null,
  asset: null,
}

const validChecklist = {
  cleanliness: 'IMPECABLE',
  chargeFillStatus: 'CARGADO',
  mountingCondition: 'SANA',
  sealStatus: 'TIENE',
  ringStatus: 'TIENE',
  hoseNozzleCondition: 'SANA',
  chargeExpirationDateObserved: '2027-01-01',
}

const allFieldsOk = [
  { field: 'cylinderNumber', action: 'OK' },
  { field: 'expirationDate', action: 'OK' },
  { field: 'capacity', action: 'OK' },
  { field: 'type', action: 'OK' },
  { field: 'brand', action: 'OK' },
  { field: 'iramCertificateNumber', action: 'OK' },
]

function makeAssetAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_AUDIT_ID,
    fireExtinguisherId: TRACTOR_FE_ID,
    status: 'SUBMITTED',
    auditDate: BASE_DATE,
    auditPeriod: '2026-07',
    auditedBy: 'auditor@losodwyer.com',
    locationConfirmed: true,
    locationChangeRequested: false,
    proposedLocation: null,
    locationChangeReason: null,
    cleanliness: 'IMPECABLE',
    chargeFillStatus: 'CARGADO',
    mountingCondition: 'SANA',
    sealStatus: 'TIENE',
    ringStatus: 'TIENE',
    hoseNozzleCondition: 'SANA',
    chargeExpirationDateObserved: new Date('2027-01-01T00:00:00.000Z'),
    comments: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    proposedChanges: [] as unknown[],
    attachments: [] as unknown[],
    extinguisher: { establishment: null, assetId: fakeTractorFe.assetId, asset: { assetType: 'Tractor' } },
    ...overrides,
  }
}

describe('Asset Audits API (población ASSET del motor de fire-extinguisher-audits)', () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.fireExtinguisher.findUnique.mockResolvedValue(fakeTractorFe)
    db.fireExtinguisher.findMany.mockResolvedValue([fakeTractorFe])
    db.fireExtinguisherAudit.create.mockResolvedValue({ id: ASSET_AUDIT_ID })
    db.fireExtinguisherAuditProposedChange.create.mockResolvedValue({})
    db.fireExtinguisherAudit.findUniqueOrThrow.mockResolvedValue(makeAssetAuditRow())
    db.userAuditScope.findMany.mockResolvedValue([])
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  describe('POST /api/v1/asset-audits', () => {
    const validBody = {
      fireExtinguisherId: TRACTOR_FE_ID,
      locationReview: { action: 'OK' },
      masterDataReview: allFieldsOk,
      checklist: validChecklist,
    }

    it('returns 201 for a matafuego linked to a tractor (vehicle/machinery)', async () => {
      const res = await request(app).post('/api/v1/asset-audits').set('Authorization', `Bearer ${adminToken()}`).send(validBody)

      expect(res.status).toBe(201)
      expect(res.body.data.checklist.mountingCondition).toBe('SANA')
    })

    it('returns 400 FIRE_EXTINGUISHER_NOT_ASSET_LINKED for a matafuego of a building (wrong population)', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeBuildingFe)

      const res = await request(app)
        .post('/api/v1/asset-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, fireExtinguisherId: BUILDING_FE_ID })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FIRE_EXTINGUISHER_NOT_ASSET_LINKED')
    })

    it('returns 201 for a USER auditor with this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['asset_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: fakeTractorFe.assetId }])

      const res = await request(app).post('/api/v1/asset-audits').set('Authorization', `Bearer ${userToken()}`).send(validBody)

      expect(res.status).toBe(201)
    })

    it('returns 404 for a USER auditor who does not have this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['asset_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'a0000000-0000-0000-0000-000000000099' }])

      const res = await request(app).post('/api/v1/asset-audits').set('Authorization', `Bearer ${userToken()}`).send(validBody)

      expect(res.status).toBe(404)
    })

    it('returns 403 for a USER without the asset_audit_coverage module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app).post('/api/v1/asset-audits').set('Authorization', `Bearer ${userToken()}`).send(validBody)

      expect(res.status).toBe(403)
    })

    it('returns 400 for a vehicle-linked matafuego whose asset does not have the "fireExtinguisherAuditable" flag set', async () => {
      // El tilde `fireExtinguisherAuditable` decide si un vehículo con
      // matafuego entra en la rotación de Auditoría de Rodados — sin él, el
      // matafuego queda afuera de Rodados (y también de Matafuegos, ver
      // fire-extinguisher-audits.review.test.ts).
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeNonAuditableTractorFe)

      const res = await request(app)
        .post('/api/v1/asset-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validBody, fireExtinguisherId: fakeNonAuditableTractorFe.id })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FIRE_EXTINGUISHER_NOT_ASSET_LINKED')
    })
  })

  describe('GET /api/v1/asset-audits/coverage', () => {
    it('includes the tractor-linked matafuego with its category, excludes the building one', async () => {
      db.fireExtinguisher.findMany.mockResolvedValue([fakeTractorFe, fakeBuildingFe])
      db.fireExtinguisherAudit.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/asset-audits/coverage?period=2026-07')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const ids = res.body.data.map((d: any) => d.id)
      expect(ids).toContain(TRACTOR_FE_ID)
      expect(ids).not.toContain(BUILDING_FE_ID)
      expect(res.body.data.find((d: any) => d.id === TRACTOR_FE_ID).category).toBe('tractor')
    })

    it('excludes a vehicle-linked matafuego whose asset does not have the "fireExtinguisherAuditable" flag set', async () => {
      db.fireExtinguisher.findMany.mockResolvedValue([fakeTractorFe, fakeNonAuditableTractorFe])
      db.fireExtinguisherAudit.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/asset-audits/coverage?period=2026-07')
        .set('Authorization', `Bearer ${adminToken()}`)

      const ids = res.body.data.map((d: any) => d.id)
      expect(ids).toContain(TRACTOR_FE_ID)
      expect(ids).not.toContain(fakeNonAuditableTractorFe.id)
    })
  })

  describe('Comentarios de Cobertura (población ASSET)', () => {
    describe('GET /api/v1/asset-audits/comments', () => {
      it('only returns comments for extinguishers of the ASSET population (excludes Matafuegos)', async () => {
        db.fireExtinguisher.findMany.mockResolvedValue([fakeTractorFe, fakeBuildingFe])
        db.auditComment.findMany.mockResolvedValue([
          { id: 'c1', targetType: 'FIRE_EXTINGUISHER', targetId: TRACTOR_FE_ID, source: 'AUDITOR_NOTE', auditStatus: null, body: 'Nota de Rodados', authorEmail: 'auditor@losodwyer.com', seenAt: null, seenByEmail: null, createdAt: BASE_DATE },
          { id: 'c2', targetType: 'FIRE_EXTINGUISHER', targetId: BUILDING_FE_ID, source: 'AUDITOR_NOTE', auditStatus: null, body: 'Nota de Matafuegos', authorEmail: 'auditor@losodwyer.com', seenAt: null, seenByEmail: null, createdAt: BASE_DATE },
        ])

        const res = await request(app)
          .get('/api/v1/asset-audits/comments?period=2026-07')
          .set('Authorization', `Bearer ${adminToken()}`)

        expect(res.status).toBe(200)
        expect(res.body.data).toHaveLength(1)
        expect(res.body.data[0].id).toBe('c1')
      })
    })

    describe('POST /api/v1/asset-audits/comments', () => {
      it('returns 404 for an extinguisher belonging to the ESTABLISHMENT population (Matafuegos)', async () => {
        db.fireExtinguisher.findUnique.mockResolvedValue(fakeBuildingFe)

        const res = await request(app)
          .post('/api/v1/asset-audits/comments')
          .set('Authorization', `Bearer ${adminToken()}`)
          .send({ targetId: BUILDING_FE_ID, body: 'Este no es mío' })

        expect(res.status).toBe(404)
      })
    })

    describe('POST /api/v1/asset-audits/comments/:id/mark-seen', () => {
      it('returns 404 for a comment on an extinguisher of the ESTABLISHMENT population (Matafuegos)', async () => {
        db.auditComment.findUnique.mockResolvedValue({ id: 'c1', targetType: 'FIRE_EXTINGUISHER', targetId: BUILDING_FE_ID, authorEmail: 'x@losodwyer.com' })
        db.fireExtinguisher.findUnique.mockResolvedValue(fakeBuildingFe)

        const res = await request(app)
          .post('/api/v1/asset-audits/comments/c1/mark-seen')
          .set('Authorization', `Bearer ${adminToken()}`)

        expect(res.status).toBe(404)
      })
    })
  })

  describe('Aislamiento entre las dos colas (Matafuegos vs Activos)', () => {
    it('GET /api/v1/asset-audits/:id returns 404 for an audit that belongs to the ESTABLISHMENT population, even for ADMIN', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(
        makeAssetAuditRow({
          id: ESTABLISHMENT_AUDIT_ID,
          fireExtinguisherId: BUILDING_FE_ID,
          extinguisher: { establishment: 'PLANTA', assetId: null, asset: null },
        }),
      )

      const res = await request(app)
        .get(`/api/v1/asset-audits/${ESTABLISHMENT_AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('GET /api/v1/fire-extinguisher-audits/:id returns 404 for an audit that belongs to the ASSET population, even for ADMIN', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAssetAuditRow())

      const res = await request(app)
        .get(`/api/v1/fire-extinguisher-audits/${ASSET_AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/v1/asset-audits/audit-dashboard', () => {
    it('groups by category and labels the mounting-condition control point "Soporte / Abrazadera"', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['asset_audit_dashboard'] }))
      db.fireExtinguisher.findMany.mockResolvedValue([fakeTractorFe])
      db.fireExtinguisherAudit.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/asset-audits/audit-dashboard?period=2026-07')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.groups[0].category).toBe('tractor')
      const mountingPoint = res.body.data.controlPoints.find((c: any) => c.key === 'mountingCondition')
      expect(mountingPoint.label).toBe('Soporte / Abrazadera')
    })
  })

  // ── GET /api/v1/asset-audits/assignments ──────────────────────────────────

  describe('GET /api/v1/asset-audits/assignments', () => {
    it('returns 200 with auditors and eligible assets for ADMIN', async () => {
      db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Auditor Uno', email: 'auditor1@losodwyer.com' }])
      // Elegible solo si tiene al menos un matafuego activo vinculado — mismo
      // criterio que Cobertura, ver asset-audits-assignments.service.ts.
      db.fireExtinguisher.findMany.mockResolvedValue([
        {
          assetId: fakeTractorFe.assetId,
          asset: { id: fakeTractorFe.assetId, code: 'MAQ-010', name: 'Tractor 10', assetType: 'Tractor', fireExtinguisherAuditable: true, metadata: null },
        },
      ])
      db.userAuditScope.findMany.mockResolvedValue([{ userId: 'u1', scopeValue: fakeTractorFe.assetId }])

      const res = await request(app)
        .get('/api/v1/asset-audits/assignments')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.auditors).toEqual([
        { userId: 'u1', name: 'Auditor Uno', email: 'auditor1@losodwyer.com', assetIds: [fakeTractorFe.assetId] },
      ])
      expect(res.body.data.assets[0]).toMatchObject({ id: fakeTractorFe.assetId, category: 'tractor' })
    })

    it('returns 403 for a non-ADMIN, even with asset_audits module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['asset_audits'] }))

      const res = await request(app)
        .get('/api/v1/asset-audits/assignments')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── PUT /api/v1/asset-audits/assignments/:userId ───────────────────────────

  describe('PUT /api/v1/asset-audits/assignments/:userId', () => {
    it('returns 200 and replaces the scope with the given assetIds', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      // El fixture global de fireExtinguisher.findMany (beforeEach) ya cubre
      // este activo — ver fakeTractorFe.

      const res = await request(app)
        .put('/api/v1/asset-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [fakeTractorFe.assetId] })

      expect(res.status).toBe(200)
      expect(db.userAuditScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', area: 'ASSET_AUDIT' } })
      expect(db.userAuditScope.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u1', area: 'ASSET_AUDIT', scopeValue: fakeTractorFe.assetId }],
      })
    })

    it('returns 404 when the target user does not exist', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce(null)

      const res = await request(app)
        .put('/api/v1/asset-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [] })

      expect(res.status).toBe(404)
    })

    it('silently drops an assetId that is not (or no longer) eligible for Auditoría de Rodados, instead of failing the whole save', async () => {
      // Puede pasar con datos viejos: un activo asignado antes de perder el
      // tilde o el matafuego vinculado — no debe bloquear que se guarde el
      // resto (ver el comentario en asset-audits-assignments.service.ts).
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      db.fireExtinguisher.findMany.mockResolvedValue([]) // ningún matafuego activo vinculado a ese activo

      const res = await request(app)
        .put('/api/v1/asset-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [fakeTractorFe.assetId] })

      expect(res.status).toBe(200)
      expect(db.userAuditScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', area: 'ASSET_AUDIT' } })
      expect(db.userAuditScope.createMany).not.toHaveBeenCalled()
    })

    it('returns 403 for a non-ADMIN', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['asset_audits'] }))

      const res = await request(app)
        .put('/api/v1/asset-audits/assignments/u1')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ assetIds: [] })

      expect(res.status).toBe(403)
    })
  })
})
