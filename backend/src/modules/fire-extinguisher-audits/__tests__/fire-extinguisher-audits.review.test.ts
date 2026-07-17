import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    fireExtinguisher: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    fireExtinguisherAudit: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    fireExtinguisherAuditProposedChange: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    fireExtinguisherHistory: {
      create: jest.fn(),
    },
    fireExtinguisherAttachment: {
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2026-07-06T00:00:00.000Z')
const FE_ID = '60000000-0000-0000-0000-000000000001'
const AUDIT_ID = '70000000-0000-0000-0000-000000000001'
const PC_CYLINDER = '80000000-0000-0000-0000-000000000001'
const PC_CAPACITY = '80000000-0000-0000-0000-000000000002'
const PC_LOCATION = '80000000-0000-0000-0000-000000000003'

const fakeFireExt = {
  id: FE_ID,
  cylinderNumber: 'CIL-001',
  expirationDate: new Date('2027-01-01T00:00:00.000Z'),
  capacity: '10 kg',
  type: 'Polvo seco ABC',
  brand: 'Cesa',
  location: 'Planta baja',
  establishment: 'PLANTA',
  isActive: true,
}

function makeProposedChange(id: string, fieldName: string, currentValue: string, proposedValue: string, status = 'PENDING') {
  return { id, auditId: AUDIT_ID, fireExtinguisherId: FE_ID, fieldName, currentValue, proposedValue, reason: null, status }
}

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AUDIT_ID,
    fireExtinguisherId: FE_ID,
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
    beaconPlateCondition: 'SANA',
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
    ...overrides,
  }
}

const threeProposedChanges = [
  makeProposedChange(PC_CYLINDER, 'cylinderNumber', 'CIL-001', 'CIL-999'),
  makeProposedChange(PC_CAPACITY, 'capacity', '10 kg', '6 kg'),
  makeProposedChange(PC_LOCATION, 'location', 'Planta baja', 'Depósito nuevo'),
]

describe('Fire Extinguisher Audits — Review API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
    db.fireExtinguisher.update.mockResolvedValue(fakeFireExt)
    db.fireExtinguisherHistory.create.mockResolvedValue({})
    db.fireExtinguisherAuditProposedChange.updateMany.mockResolvedValue({ count: 0 })
    db.fireExtinguisherAudit.update.mockResolvedValue({})
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  // ── POST /:id/review ───────────────────────────────────────────────────────

  describe('POST /api/v1/fire-extinguisher-audits/:id/review', () => {
    it('applies all approved changes to the master and marks the audit APPROVED', async () => {
      db.fireExtinguisherAudit.findUnique
        .mockResolvedValueOnce(makeAuditRow({ proposedChanges: threeProposedChanges }))
        .mockResolvedValueOnce(
          makeAuditRow({
            status: 'APPROVED',
            reviewedBy: 'test@losodwyer.com',
            reviewedAt: BASE_DATE,
            proposedChanges: threeProposedChanges.map((c) => ({ ...c, status: 'APPLIED' })),
          }),
        )

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          decisions: [
            { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
            { proposedChangeId: PC_CAPACITY, decision: 'APPROVED' },
            { proposedChangeId: PC_LOCATION, decision: 'APPROVED' },
          ],
          auditDecision: 'APPROVED',
        })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('APPROVED')
      expect(res.body.data.proposedChanges.every((c: any) => c.status === 'APPLIED')).toBe(true)

      expect(db.fireExtinguisher.update).toHaveBeenCalledWith({
        where: { id: FE_ID },
        data: { cylinderNumber: 'CIL-999', capacity: '6 kg', location: 'Depósito nuevo' },
      })

      const historyCall = db.fireExtinguisherHistory.create.mock.calls[0][0].data
      expect(historyCall.previousData).toEqual({ cylinderNumber: 'CIL-001', capacity: '10 kg', location: 'Planta baja' })
      expect(historyCall.newData).toEqual({ cylinderNumber: 'CIL-999', capacity: '6 kg', location: 'Depósito nuevo' })
      expect(historyCall.action).toBe('Auditoría')

      expect(db.fireExtinguisherAuditProposedChange.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [PC_CYLINDER, PC_CAPACITY, PC_LOCATION] } },
        data: { status: 'APPLIED' },
      })

      const auditUpdateData = db.fireExtinguisherAudit.update.mock.calls[0][0].data
      expect(auditUpdateData.status).toBe('APPROVED')
      expect(auditUpdateData.reviewedBy).toBe('test@losodwyer.com')
      expect(auditUpdateData.reviewedAt).toBeInstanceOf(Date)
    })

    it('applies only the approved subset and rejects the rest (partial approval)', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: threeProposedChanges }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          decisions: [
            { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
            { proposedChangeId: PC_CAPACITY, decision: 'APPROVED' },
            { proposedChangeId: PC_LOCATION, decision: 'REJECTED' },
          ],
          auditDecision: 'APPROVED',
        })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisher.update).toHaveBeenCalledWith({
        where: { id: FE_ID },
        data: { cylinderNumber: 'CIL-999', capacity: '6 kg' },
      })

      const historyCall = db.fireExtinguisherHistory.create.mock.calls[0][0].data
      expect(historyCall.previousData).toEqual({ cylinderNumber: 'CIL-001', capacity: '10 kg' })
      expect(historyCall.newData).toEqual({ cylinderNumber: 'CIL-999', capacity: '6 kg' })

      expect(db.fireExtinguisherAuditProposedChange.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [PC_CYLINDER, PC_CAPACITY] } },
        data: { status: 'APPLIED' },
      })
      expect(db.fireExtinguisherAuditProposedChange.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [PC_LOCATION] } },
        data: { status: 'REJECTED' },
      })
    })

    it.each(['REJECTED', 'NEEDS_CORRECTION'])(
      'applies nothing to the master when auditDecision is %s, regardless of individual decisions',
      async (auditDecision) => {
        db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: threeProposedChanges }))

        const res = await request(app)
          .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
          .set('Authorization', `Bearer ${adminToken()}`)
          .send({
            decisions: [
              { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
              { proposedChangeId: PC_CAPACITY, decision: 'REJECTED' },
              { proposedChangeId: PC_LOCATION, decision: 'APPROVED' },
            ],
            auditDecision,
          })

        expect(res.status).toBe(200)
        expect(db.fireExtinguisher.update).not.toHaveBeenCalled()
        expect(db.fireExtinguisherHistory.create).not.toHaveBeenCalled()
        expect(db.fireExtinguisherAuditProposedChange.updateMany).toHaveBeenCalledTimes(1)
        expect(db.fireExtinguisherAuditProposedChange.updateMany).toHaveBeenCalledWith({
          where: { id: { in: [PC_CYLINDER, PC_CAPACITY, PC_LOCATION] } },
          data: { status: 'REJECTED' },
        })

        const auditUpdateData = db.fireExtinguisherAudit.update.mock.calls[0][0].data
        expect(auditUpdateData.status).toBe(auditDecision)
      },
    )

    it('accepts a checklist-only audit (no proposed changes) with an empty decisions array', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: [] }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ decisions: [], auditDecision: 'APPROVED' })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisher.update).not.toHaveBeenCalled()
      expect(db.fireExtinguisherHistory.create).not.toHaveBeenCalled()
      expect(db.fireExtinguisherAuditProposedChange.updateMany).not.toHaveBeenCalled()
      const auditUpdateData = db.fireExtinguisherAudit.update.mock.calls[0][0].data
      expect(auditUpdateData.status).toBe('APPROVED')
    })

    it.each(['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'])(
      'returns 409 ALREADY_REVIEWED when the audit status is already %s',
      async (status) => {
        db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ status, proposedChanges: [] }))

        const res = await request(app)
          .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
          .set('Authorization', `Bearer ${adminToken()}`)
          .send({ decisions: [], auditDecision: 'APPROVED' })

        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('ALREADY_REVIEWED')
      },
    )

    it('returns 404 when the audit does not exist', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ decisions: [], auditDecision: 'APPROVED' })

      expect(res.status).toBe(404)
    })

    it('returns 403 for a USER without the fire_extinguisher_audits module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ decisions: [], auditDecision: 'APPROVED' })

      expect(res.status).toBe(403)
    })

    it.each([
      ['ADMIN', 'ADMIN'],
      // Con el modelo de perfiles "todo o nada", cualquier USER con el
      // módulo puede revisar — ya no hay una excepción tipo AUDITOR_MATAFUEGOS.
      ['a USER with the fire_extinguisher_audits module', 'USER'],
    ] as const)('returns 200 for %s', async (_label, role) => {
      if (role === 'USER') {
        db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['fire_extinguisher_audits'] }))
      }
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: [] }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${role === 'ADMIN' ? adminToken() : userToken()}`)
        .send({ decisions: [], auditDecision: 'APPROVED' })

      expect(res.status).toBe(200)
    })

    it('returns 403 SELF_REVIEW_FORBIDDEN when the reviewer is the same person who audited it', async () => {
      // adminToken() resuelve a mockDbUser() por default, cuyo email es
      // 'test@losodwyer.com' — coincide a propósito con auditedBy acá.
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(
        makeAuditRow({ auditedBy: 'test@losodwyer.com', proposedChanges: [] }),
      )

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ decisions: [], auditDecision: 'APPROVED' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('SELF_REVIEW_FORBIDDEN')
    })

    it('returns 422 DECISIONS_MISMATCH when a pending change is missing from decisions', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: threeProposedChanges }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          decisions: [
            { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
            { proposedChangeId: PC_CAPACITY, decision: 'APPROVED' },
          ],
          auditDecision: 'APPROVED',
        })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('DECISIONS_MISMATCH')
    })

    it('returns 422 DECISIONS_MISMATCH when decisions includes a foreign proposedChangeId', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: [threeProposedChanges[0]] }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          decisions: [
            { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
            { proposedChangeId: '90000000-0000-0000-0000-000000000000', decision: 'APPROVED' },
          ],
          auditDecision: 'APPROVED',
        })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('DECISIONS_MISMATCH')
    })

    it('returns 422 DUPLICATE_DECISION when the same proposedChangeId appears twice', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(makeAuditRow({ proposedChanges: [threeProposedChanges[0]] }))

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          decisions: [
            { proposedChangeId: PC_CYLINDER, decision: 'APPROVED' },
            { proposedChangeId: PC_CYLINDER, decision: 'REJECTED' },
          ],
          auditDecision: 'APPROVED',
        })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('DUPLICATE_DECISION')
    })
  })

  // ── GET / ──────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fire-extinguisher-audits', () => {
    beforeEach(() => {
      db.fireExtinguisherAudit.findMany.mockResolvedValue([
        {
          ...makeAuditRow(),
          extinguisher: { id: FE_ID, code: 'MAT-001-A', cylinderNumber: 'CIL-01', type: 'Polvo seco ABC', establishment: 'PLANTA', location: 'Planta baja' },
          _count: { proposedChanges: 2 },
        },
      ])
      db.fireExtinguisherAudit.count.mockResolvedValue(1)
    })

    it('returns items with extinguisher data and proposedChangesCount, no filter', async () => {
      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, orderBy: { createdAt: 'desc' } }),
      )
      expect(res.body.data[0].extinguisher.code).toBe('MAT-001-A')
      expect(res.body.data[0].proposedChangesCount).toBe(2)
      expect(res.body.pagination.total).toBe(1)
    })

    it('filters by a single status', async () => {
      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits?status=SUBMITTED')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: ['SUBMITTED'] } } }),
      )
    })

    it('filters by multiple statuses', async () => {
      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits?status=SUBMITTED&status=NEEDS_CORRECTION')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: ['SUBMITTED', 'NEEDS_CORRECTION'] } } }),
      )
    })
  })

  // ── GET /coverage ──────────────────────────────────────────────────────────

  describe('GET /api/v1/fire-extinguisher-audits/coverage', () => {
    const OTHER_FE_ID = '60000000-0000-0000-0000-000000000002'
    const REJECTED_FE_ID = '60000000-0000-0000-0000-000000000003'

    beforeEach(() => {
      db.fireExtinguisher.findMany.mockResolvedValue([
        { id: FE_ID, code: 'MAT-001-A', cylinderNumber: 'CIL-01', type: 'Polvo seco ABC', establishment: 'PLANTA', location: 'Planta baja' },
        { id: OTHER_FE_ID, code: 'MAT-002-A', cylinderNumber: 'CIL-02', type: 'CO2', establishment: 'PLANTA', location: null },
        { id: REJECTED_FE_ID, code: 'MAT-003-A', cylinderNumber: 'CIL-03', type: 'CO2', establishment: 'TALLER', location: null },
      ])
      db.fireExtinguisherAudit.findMany.mockResolvedValue([
        { fireExtinguisherId: FE_ID, status: 'APPROVED', auditDate: BASE_DATE },
        { fireExtinguisherId: REJECTED_FE_ID, status: 'REJECTED', auditDate: BASE_DATE },
      ])
    })

    it('marks extinguishers with a non-rejected audit this period as audited, the rest as pending', async () => {
      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits/coverage?period=2026-07')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { auditPeriod: '2026-07', status: { not: 'REJECTED' } } }),
      )

      const byId = Object.fromEntries(res.body.data.map((d: any) => [d.id, d]))
      expect(byId[FE_ID].audited).toBe(true)
      expect(byId[FE_ID].auditStatus).toBe('APPROVED')
      expect(byId[OTHER_FE_ID].audited).toBe(false)
      expect(byId[OTHER_FE_ID].auditStatus).toBeNull()
    })

    it('does not count a REJECTED audit as coverage — the query already excludes it, service just reflects that', async () => {
      db.fireExtinguisherAudit.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits/coverage?period=2026-07')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      const rejectedRow = res.body.data.find((d: any) => d.id === REJECTED_FE_ID)
      expect(rejectedRow.audited).toBe(false)
    })

    it('returns 422 when period has an invalid format', async () => {
      const res = await request(app)
        .get('/api/v1/fire-extinguisher-audits/coverage?period=07-2026')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(422)
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/fire-extinguisher-audits/coverage?period=2026-07')
      expect(res.status).toBe(401)
    })
  })

  // ── Recorrección (create() sigue funcionando sin cambios) ─────────────────

  describe('Recorrección tras NEEDS_CORRECTION/REJECTED', () => {
    it('allows creating a new audit for the same fireExtinguisherId+auditPeriod (create() needs no change)', async () => {
      // La integridad real de "solo bloquear si la última auditoría activa
      // sigue SUBMITTED/APPROVED" vive en el índice único PARCIAL de Postgres
      // (ver migración 20260707120000), no verificable con Prisma mockeado.
      // Este test solo confirma que create() no tiene ningún guard propio que
      // impediría la recorrección — la ausencia de guard es la implementación.
      db.fireExtinguisherAudit.create.mockResolvedValue({ id: 'new-audit-id' })
      db.fireExtinguisherAuditProposedChange.create.mockResolvedValue({})
      db.fireExtinguisherAudit.findUniqueOrThrow.mockResolvedValue(makeAuditRow({ id: 'new-audit-id' }))

      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          fireExtinguisherId: FE_ID,
          locationReview: { action: 'OK' },
          masterDataReview: [
            { field: 'cylinderNumber', action: 'OK' },
            { field: 'expirationDate', action: 'OK' },
            { field: 'capacity', action: 'OK' },
            { field: 'type', action: 'OK' },
            { field: 'brand', action: 'OK' },
          ],
          checklist: {
            cleanliness: 'IMPECABLE',
            chargeFillStatus: 'CARGADO',
            beaconPlateCondition: 'SANA',
            sealStatus: 'TIENE',
            ringStatus: 'TIENE',
            hoseNozzleCondition: 'SANA',
            chargeExpirationDateObserved: '2027-01-01',
          },
        })

      expect(res.status).toBe(201)
    })
  })
})
