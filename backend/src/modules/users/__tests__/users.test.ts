import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../../app'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const ADMIN_ID = '80000000-0000-0000-0000-000000000001'
const OTHER_ID = '80000000-0000-0000-0000-000000000002'

function adminToken() {
  return jwt.sign({ userId: ADMIN_ID, role: 'ADMIN', email: 'admin@losodwyer.com' }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
  })
}

function auditorToken() {
  return jwt.sign(
    { userId: OTHER_ID, role: 'AUDITOR_MATAFUEGOS', email: 'auditor@losodwyer.com' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' },
  )
}

const fakeUser = {
  id: OTHER_ID,
  name: 'Auditor Uno',
  email: 'auditor@losodwyer.com',
  passwordHash: 'hashed-password',
  role: 'AUDITOR_MATAFUEGOS',
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

describe('Users API (admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/v1/users', () => {
    it('returns 403 for a non-ADMIN role', async () => {
      const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${auditorToken()}`)
      expect(res.status).toBe(403)
    })

    it('returns the user list without passwordHash for ADMIN', async () => {
      db.user.findMany.mockResolvedValue([fakeUser])

      const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].passwordHash).toBeUndefined()
      expect(res.body.data[0].email).toBe('auditor@losodwyer.com')
    })
  })

  describe('POST /api/v1/users', () => {
    it('returns 403 for a non-ADMIN role', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${auditorToken()}`)
        .send({ name: 'Nuevo', email: 'nuevo@losodwyer.com', role: 'AUDITOR_MATAFUEGOS', password: 'Password1' })

      expect(res.status).toBe(403)
    })

    it('creates a user with mustChangePassword true', async () => {
      db.user.findUnique.mockResolvedValue(null)
      db.user.create.mockResolvedValue({ ...fakeUser, mustChangePassword: true })

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Auditor Uno', email: 'auditor@losodwyer.com', role: 'AUDITOR_MATAFUEGOS', password: 'Password1' })

      expect(res.status).toBe(201)
      expect(res.body.data.mustChangePassword).toBe(true)
      expect(res.body.data.passwordHash).toBeUndefined()
      expect(db.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: true }) }),
      )
    })

    it('returns 409 when the email is already taken', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Dup', email: 'auditor@losodwyer.com', role: 'AUDITOR_MATAFUEGOS', password: 'Password1' })

      expect(res.status).toBe(409)
    })

    it('returns 422 for a role outside the assignable set', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'X', email: 'x@losodwyer.com', role: 'CONTADOR', password: 'Password1' })

      expect(res.status).toBe(422)
    })
  })

  describe('PUT /api/v1/users/:id', () => {
    it('deactivates a user', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      db.user.update.mockResolvedValue({ ...fakeUser, isActive: false })

      const res = await request(app)
        .put(`/api/v1/users/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ isActive: false })

      expect(res.status).toBe(200)
      expect(res.body.data.isActive).toBe(false)
    })

    it('returns 404 when the user does not exist', async () => {
      db.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/users/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ isActive: false })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/v1/users/:id/reset-password', () => {
    it('resets the password and sets mustChangePassword back to true', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      db.user.update.mockResolvedValue({ ...fakeUser, passwordHash: 'hashed-password' })

      const res = await request(app)
        .post(`/api/v1/users/${OTHER_ID}/reset-password`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ newPassword: 'NewPassword1' })

      expect(res.status).toBe(200)
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: OTHER_ID },
        data: { passwordHash: 'hashed-password', mustChangePassword: true },
      })
    })
  })
})
