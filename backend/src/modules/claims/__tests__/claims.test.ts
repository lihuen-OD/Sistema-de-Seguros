import request from 'supertest'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    claim: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    asset:  { findFirst: jest.fn() },
    policy: { findFirst: jest.fn() },
    claimEvent: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      delete:     jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2026-01-15T00:00:00.000Z')

const fakeClaim = {
  id: 'claim-uuid-1',
  claimNumber: 'SIN-2026-00001',
  assetId: null,
  policyId: null,
  claimType: 'accidente',
  occurrenceDate: BASE_DATE,
  reportDate: BASE_DATE,
  description: 'Siniestro de prueba',
  insuranceCompany: 'MAPFRE',
  status: 'denunciado',
  claimedAmountArs: 100000,
  realAmountArs: null,
  settledAmountArs: null,
  deductibleArs: null,
  currency: 'ARS',
  exchangeRate: 1,
  observations: null,
  isActive: true,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  asset: null,
  policy: null,
  events: [
    {
      id: 'event-uuid-1',
      claimId: 'claim-uuid-1',
      type: 'siniestro_creado',
      description: 'Siniestro registrado en el sistema',
      date: BASE_DATE,
      previousStatus: null,
      newStatus: null,
      amountLabel: null,
      previousAmount: null,
      newAmount: null,
      createdBy: 'Sistema',
      createdAt: BASE_DATE,
    },
  ],
  _count: { events: 1 },
}

const validClaimBody = {
  claimType: 'accidente',
  occurrenceDate: '2026-01-15',
  reportDate: '2026-01-15',
  description: 'Siniestro de prueba para test',
  claimedAmountArs: 100000,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Claims API', () => {

  // ── Auth guard ──────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('returns 401 on any endpoint when no token is provided', async () => {
      const res = await request(app).get('/api/v1/claims')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 when an invalid token is sent', async () => {
      const res = await request(app)
        .get('/api/v1/claims')
        .set('Authorization', 'Bearer totally.invalid.token')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('TOKEN_INVALID')
    })
  })

  // ── GET /api/v1/claims ──────────────────────────────────────────────────────

  describe('GET /api/v1/claims', () => {
    it('returns 200 with paginated list for authenticated user', async () => {
      db.claim.findMany.mockResolvedValue([fakeClaim])
      db.claim.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].claimNumber).toBe('SIN-2026-00001')
      expect(res.body.pagination.total).toBe(1)
    })

    it('returns empty list when no claims exist', async () => {
      db.claim.findMany.mockResolvedValue([])
      db.claim.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/claims')
        .set('Authorization', `Bearer ${viewerToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
      expect(res.body.pagination.total).toBe(0)
    })
  })

  // ── GET /api/v1/claims/:id ──────────────────────────────────────────────────

  describe('GET /api/v1/claims/:id', () => {
    it('returns 200 with full claim detail', async () => {
      db.claim.findUnique.mockResolvedValue(fakeClaim)

      const res = await request(app)
        .get('/api/v1/claims/claim-uuid-1')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('claim-uuid-1')
      expect(res.body.data.claimNumber).toBe('SIN-2026-00001')
      expect(res.body.data.events).toHaveLength(1)
    })

    it('returns 404 when claim does not exist', async () => {
      db.claim.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/v1/claims/non-existent-id')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  // ── POST /api/v1/claims ─────────────────────────────────────────────────────

  describe('POST /api/v1/claims', () => {
    it('returns 201 and auto-generates claimNumber when ADMIN creates a claim', async () => {
      db.$queryRaw.mockResolvedValue([{ nextval: BigInt(1) }])
      db.claim.create.mockResolvedValue(fakeClaim)

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validClaimBody)

      expect(res.status).toBe(201)
      expect(res.body.data.claimNumber).toBe('SIN-2026-00001')
      expect(res.body.data.status).toBe('denunciado')
      expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    })

    it('returns 201 when CONTADOR creates a claim', async () => {
      db.$queryRaw.mockResolvedValue([{ nextval: BigInt(2) }])
      db.claim.create.mockResolvedValue({ ...fakeClaim, claimNumber: 'SIN-2026-00002' })

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${contadorToken()}`)
        .send(validClaimBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 when VIEWER tries to create a claim', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send(validClaimBody)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('returns 422 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ claimType: 'accidente' }) // missing description, occurrenceDate, reportDate

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details).toBeDefined()
    })

    it('returns 422 when claimType is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validClaimBody, claimType: 'tipo_invalido' })

      expect(res.status).toBe(422)
    })

    it('returns 400 when assetId does not reference an active asset', async () => {
      db.asset.findFirst.mockResolvedValue(null) // asset not found

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validClaimBody, assetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })

    it('creates event "siniestro_creado" automatically on claim creation', async () => {
      db.$queryRaw.mockResolvedValue([{ nextval: BigInt(3) }])
      db.claim.create.mockResolvedValue(fakeClaim)

      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validClaimBody)

      expect(res.status).toBe(201)
      expect(res.body.data.events[0].type).toBe('siniestro_creado')

      // Verify the service passed the auto-event to Prisma
      const createCall = db.claim.create.mock.calls[0][0]
      expect(createCall.data.events.create.type).toBe('siniestro_creado')
    })
  })

  // ── PUT /api/v1/claims/:id ──────────────────────────────────────────────────

  describe('PUT /api/v1/claims/:id', () => {
    it('returns 200 when ADMIN updates status', async () => {
      db.claim.findUnique.mockResolvedValue(fakeClaim) // assertExists
      db.claim.update.mockResolvedValue({ ...fakeClaim, status: 'en_tramite', events: [] })

      const res = await request(app)
        .put('/api/v1/claims/claim-uuid-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'en_tramite' })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('en_tramite')
    })

    it('returns 403 when VIEWER tries to update', async () => {
      const res = await request(app)
        .put('/api/v1/claims/claim-uuid-1')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send({ status: 'en_tramite' })

      expect(res.status).toBe(403)
    })

    it('returns 404 when claim does not exist', async () => {
      db.claim.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put('/api/v1/claims/non-existent')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ status: 'en_tramite' })

      expect(res.status).toBe(404)
    })
  })

  // ── DELETE /api/v1/claims/:id ───────────────────────────────────────────────

  describe('DELETE /api/v1/claims/:id', () => {
    it('returns 200 when ADMIN soft-deletes a claim', async () => {
      db.claim.findUnique.mockResolvedValue(fakeClaim)
      db.claim.update.mockResolvedValue({ ...fakeClaim, isActive: false })

      const res = await request(app)
        .delete('/api/v1/claims/claim-uuid-1')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.message).toContain('desactivado')
      // Verify isActive: false was passed
      expect(db.claim.update.mock.calls[0][0].data.isActive).toBe(false)
    })

    it('returns 403 when CONTADOR tries to delete', async () => {
      const res = await request(app)
        .delete('/api/v1/claims/claim-uuid-1')
        .set('Authorization', `Bearer ${contadorToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── POST /api/v1/claims/:id/events ─────────────────────────────────────────

  describe('POST /api/v1/claims/:id/events', () => {
    const fakeEvent = {
      id: 'event-uuid-2',
      claimId: 'claim-uuid-1',
      type: 'nota_agregada',
      description: 'Se agrega nota de seguimiento',
      date: BASE_DATE,
      previousStatus: null,
      newStatus: null,
      amountLabel: null,
      previousAmount: null,
      newAmount: null,
      createdBy: 'test@losodwyer.com',
      createdAt: BASE_DATE,
    }

    it('returns 201 when ADMIN adds an event', async () => {
      db.claim.findUnique.mockResolvedValue(fakeClaim) // assertExists
      db.claimEvent.create.mockResolvedValue(fakeEvent)

      const res = await request(app)
        .post('/api/v1/claims/claim-uuid-1/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          type: 'nota_agregada',
          description: 'Se agrega nota de seguimiento',
          date: '2026-01-15',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.type).toBe('nota_agregada')
    })

    it('returns 403 when VIEWER tries to add an event', async () => {
      const res = await request(app)
        .post('/api/v1/claims/claim-uuid-1/events')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send({ type: 'nota_agregada', description: 'Nota', date: '2026-01-15' })

      expect(res.status).toBe(403)
    })

    it('returns 422 when event type is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/claims/claim-uuid-1/events')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ type: 'tipo_invalido', description: 'Nota', date: '2026-01-15' })

      expect(res.status).toBe(422)
    })
  })
})
