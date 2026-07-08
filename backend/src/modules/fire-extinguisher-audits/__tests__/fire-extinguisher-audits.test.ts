import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken, auditorMatafuegosToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    fireExtinguisher: {
      findUnique: jest.fn(),
    },
    fireExtinguisherAudit: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    fireExtinguisherAuditProposedChange: {
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
const OTHER_FE_ID = '60000000-0000-0000-0000-000000000099'
const AUDIT_ID = '70000000-0000-0000-0000-000000000001'
const OTHER_AUDIT_ID = '70000000-0000-0000-0000-000000000099'

const fakeFireExt = {
  id: FE_ID,
  cylinderNumber: 'CIL-001',
  expirationDate: new Date('2027-01-01T00:00:00.000Z'),
  capacity: '10 kg',
  type: 'Polvo seco ABC',
  brand: 'Cesa',
  location: 'Planta baja',
  isActive: true,
}

const fakeAuditRow = {
  id: AUDIT_ID,
  fireExtinguisherId: FE_ID,
  status: 'SUBMITTED',
  auditDate: BASE_DATE,
  auditPeriod: '2026-07',
  auditedBy: 'test@losodwyer.com',
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
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  proposedChanges: [] as unknown[],
  attachments: [] as unknown[],
}

const allFieldsOk = [
  { field: 'cylinderNumber', action: 'OK' },
  { field: 'expirationDate', action: 'OK' },
  { field: 'capacity', action: 'OK' },
  { field: 'type', action: 'OK' },
  { field: 'brand', action: 'OK' },
]

const validChecklist = {
  cleanliness: 'IMPECABLE',
  chargeFillStatus: 'CARGADO',
  beaconPlateCondition: 'SANA',
  sealStatus: 'TIENE',
  ringStatus: 'TIENE',
  hoseNozzleCondition: 'SANA',
  chargeExpirationDateObserved: '2027-01-01',
}

const validCreateBody = {
  fireExtinguisherId: FE_ID,
  locationReview: { action: 'OK' },
  masterDataReview: allFieldsOk,
  checklist: validChecklist,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fire Extinguisher Audits API', () => {
  beforeEach(() => {
    db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
    db.fireExtinguisherAudit.create.mockResolvedValue({ id: AUDIT_ID })
    db.fireExtinguisherAuditProposedChange.create.mockResolvedValue({})
    db.fireExtinguisherAudit.findUniqueOrThrow.mockResolvedValue(fakeAuditRow)
    // Soporta tanto $transaction(async (tx) => {...}) — usado por create() —
    // pasando `db` como `tx`, como $transaction([...]) en forma de array.
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  // ── POST /api/v1/fire-extinguisher-audits ─────────────────────────────────

  describe('POST /api/v1/fire-extinguisher-audits', () => {
    it('returns 201 with no proposed changes when everything is OK', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
      expect(res.body.data.id).toBe(AUDIT_ID)
      expect(res.body.data.proposedChanges).toEqual([])
      expect(db.fireExtinguisherAuditProposedChange.create).not.toHaveBeenCalled()
    })

    it('creates a proposed-change row for each modified field, including location', async () => {
      const body = {
        ...validCreateBody,
        locationReview: { action: 'MODIFICAR', proposedLocation: 'Nueva ubicación', reason: 'Se movió el equipo' },
        masterDataReview: [
          { field: 'cylinderNumber', action: 'MODIFICAR', newValue: 'CIL-999', reason: 'Cilindro cambiado' },
          { field: 'expirationDate', action: 'OK' },
          { field: 'capacity', action: 'MODIFICAR', newValue: '6 kg' },
          { field: 'type', action: 'OK' },
          { field: 'brand', action: 'OK' },
        ],
      }

      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)

      expect(res.status).toBe(201)
      expect(db.fireExtinguisherAuditProposedChange.create).toHaveBeenCalledTimes(3)

      const calls = db.fireExtinguisherAuditProposedChange.create.mock.calls.map((c: any) => c[0].data)
      const byField = Object.fromEntries(calls.map((c: any) => [c.fieldName, c]))

      expect(byField.cylinderNumber.currentValue).toBe('CIL-001')
      expect(byField.cylinderNumber.proposedValue).toBe('CIL-999')
      expect(byField.capacity.currentValue).toBe('10 kg')
      expect(byField.capacity.proposedValue).toBe('6 kg')
      expect(byField.location.currentValue).toBe('Planta baja')
      expect(byField.location.proposedValue).toBe('Nueva ubicación')
      expect(byField.location.reason).toBe('Se movió el equipo')
    })

    it('returns 409 DUPLICATE_AUDIT_PERIOD on a unique constraint violation', async () => {
      db.fireExtinguisherAudit.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['fireExtinguisherId', 'auditPeriod'] },
        }),
      )

      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_AUDIT_PERIOD')
    })

    it('returns 403 as VIEWER', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(403)
    })

    it.each([
      ['ADMIN', adminToken],
      ['CONTADOR', contadorToken],
      ['AUDITOR_MATAFUEGOS', auditorMatafuegosToken],
    ])('returns 201 for %s', async (_label, tokenFn) => {
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${tokenFn()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
    })

    it('returns 422 when fireExtinguisherId is missing', async () => {
      const { fireExtinguisherId, ...body } = validCreateBody
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)

      expect(res.status).toBe(422)
    })

    it('returns 422 when a checklist enum value is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, checklist: { ...validChecklist, cleanliness: 'NO_EXISTE' } })

      expect(res.status).toBe(422)
    })

    it('returns 422 when masterDataReview is missing an entry', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, masterDataReview: allFieldsOk.slice(0, 4) })

      expect(res.status).toBe(422)
    })

    it('returns 404 when the fire extinguisher does not exist', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, fireExtinguisherId: OTHER_FE_ID })

      expect(res.status).toBe(404)
    })

    it('returns 400 INACTIVE_FIRE_EXTINGUISHER when the unit is soft-deleted', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue({ ...fakeFireExt, isActive: false })

      const res = await request(app)
        .post('/api/v1/fire-extinguisher-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INACTIVE_FIRE_EXTINGUISHER')
    })
  })

  // ── GET /api/v1/fire-extinguisher-audits/:id ──────────────────────────────

  describe('GET /api/v1/fire-extinguisher-audits/:id', () => {
    it('returns 200 with nested proposedChanges/attachments', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue({
        ...fakeAuditRow,
        proposedChanges: [
          { id: 'pc1', fieldName: 'location', currentValue: 'A', proposedValue: 'B', reason: null, status: 'PENDING' },
        ],
        attachments: [],
      })

      const res = await request(app)
        .get(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.proposedChanges).toHaveLength(1)
      expect(res.body.data.checklist.cleanliness).toBe('IMPECABLE')
    })

    it('returns 404 when the audit does not exist', async () => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/fire-extinguisher-audits/${OTHER_AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })
  })

  // ── POST /api/v1/fire-extinguisher-audits/:id/attachments ────────────────

  describe('POST /api/v1/fire-extinguisher-audits/:id/attachments', () => {
    beforeEach(() => {
      db.fireExtinguisherAudit.findUnique.mockResolvedValue({ id: AUDIT_ID, fireExtinguisherId: FE_ID })
      db.fireExtinguisherAttachment.count.mockResolvedValue(0)
    })

    it('returns 201 for a valid JPEG photo', async () => {
      db.fireExtinguisherAttachment.create.mockResolvedValue({
        id: 'att1',
        fireExtinguisherId: FE_ID,
        auditId: AUDIT_ID,
        name: 'photo.jpg',
        fileType: 'image',
        fileSize: '1.0 KB',
        fileUrl: 'local://photo.jpg',
        uploadedAt: BASE_DATE,
        uploadedBy: 'test@losodwyer.com',
      })

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('fake-image-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(res.status).toBe(201)
      expect(res.body.data.auditId).toBe(AUDIT_ID)
    })

    it('returns 415 when uploading a non-image file', async () => {
      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'document.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(415)
      expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    })

    it('returns 400 MAX_ATTACHMENTS_EXCEEDED when the audit already has 10 photos', async () => {
      db.fireExtinguisherAttachment.count.mockResolvedValue(10)

      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('fake-image-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MAX_ATTACHMENTS_EXCEEDED')
    })

    it('returns 400 when no file is attached', async () => {
      const res = await request(app)
        .post(`/api/v1/fire-extinguisher-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
    })
  })
})
