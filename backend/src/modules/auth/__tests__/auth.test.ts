import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../../app'

// ── Prisma + bcrypt mocks ──────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}))

import { prisma } from '../../../config/database'
import bcrypt from 'bcrypt'
const db = prisma as any
const mockBcrypt = bcrypt as unknown as { compare: jest.Mock; hash: jest.Mock }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = '70000000-0000-0000-0000-000000000001'

const fakeUser = {
  id: USER_ID,
  name: 'Administrador',
  email: 'admin@losodwyer.com',
  passwordHash: 'hashed-password',
  role: 'ADMIN',
  isActive: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

function tokenFor(user: { id: string; role: string; email: string }) {
  return jwt.sign({ userId: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
  })
}

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── POST /api/v1/auth/login ─────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with token and user on valid credentials', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      mockBcrypt.compare.mockResolvedValue(true)
      db.user.update.mockResolvedValue({ ...fakeUser, lastLoginAt: new Date() })

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@losodwyer.com', password: 'CorrectPassword1' })

      expect(res.status).toBe(200)
      expect(res.body.data.token).toBeDefined()
      expect(res.body.data.user.email).toBe('admin@losodwyer.com')
      expect(res.body.data.user.passwordHash).toBeUndefined()
      expect(db.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: USER_ID }, data: { lastLoginAt: expect.any(Date) } }),
      )
    })

    it('returns the same generic error when the email does not exist', async () => {
      db.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'noexiste@losodwyer.com', password: 'whatever123' })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe('Credenciales inválidas')
    })

    it('returns the same generic error when the user is inactive', async () => {
      db.user.findUnique.mockResolvedValue({ ...fakeUser, isActive: false })

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@losodwyer.com', password: 'CorrectPassword1' })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe('Credenciales inválidas')
    })

    it('returns the same generic error when the password is wrong', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      mockBcrypt.compare.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@losodwyer.com', password: 'wrong-password' })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe('Credenciales inválidas')
    })

    it('normalizes email casing/whitespace before looking it up', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      mockBcrypt.compare.mockResolvedValue(true)
      db.user.update.mockResolvedValue(fakeUser)

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: '  ADMIN@losodwyer.com  ', password: 'CorrectPassword1' })

      expect(res.status).toBe(200)
      expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@losodwyer.com' } })
    })

    it('returns 422 when the body is malformed', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' })
      expect(res.status).toBe(422)
    })
  })

  // ── GET /api/v1/auth/me ──────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/auth/me')
      expect(res.status).toBe(401)
    })

    it('returns the current user without passwordHash', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        id: USER_ID,
        name: 'Administrador',
        email: 'admin@losodwyer.com',
        role: 'ADMIN',
      })
    })

    it('returns 401 when the user backing the token no longer exists', async () => {
      db.user.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)

      expect(res.status).toBe(401)
    })

    it('returns 401 when the user backing the token was deactivated', async () => {
      db.user.findUnique.mockResolvedValue({ ...fakeUser, isActive: false })

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)

      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/v1/auth/logout ─────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 for an authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)

      expect(res.status).toBe(200)
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/api/v1/auth/logout')
      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/v1/auth/change-password ────────────────────────────────────────

  describe('POST /api/v1/auth/change-password', () => {
    it('requires currentPassword when mustChangePassword is false', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)
        .send({ newPassword: 'NewPassword1' })

      expect(res.status).toBe(400)
    })

    it('rejects a wrong currentPassword', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      mockBcrypt.compare.mockResolvedValue(false)

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)
        .send({ currentPassword: 'wrong', newPassword: 'NewPassword1' })

      expect(res.status).toBe(400)
    })

    it('updates the password and clears mustChangePassword on success', async () => {
      db.user.findUnique.mockResolvedValue(fakeUser)
      mockBcrypt.compare.mockResolvedValue(true)
      mockBcrypt.hash.mockResolvedValue('new-hashed-password')
      db.user.update.mockResolvedValue({ ...fakeUser, passwordHash: 'new-hashed-password' })

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)
        .send({ currentPassword: 'CorrectPassword1', newPassword: 'NewPassword1' })

      expect(res.status).toBe(200)
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passwordHash: 'new-hashed-password', mustChangePassword: false },
      })
    })

    it('does not require currentPassword when mustChangePassword is true', async () => {
      db.user.findUnique.mockResolvedValue({ ...fakeUser, mustChangePassword: true })
      mockBcrypt.hash.mockResolvedValue('new-hashed-password')
      db.user.update.mockResolvedValue(fakeUser)

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)
        .send({ newPassword: 'NewPassword1' })

      expect(res.status).toBe(200)
    })

    it('returns 422 when newPassword does not meet the minimum policy', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tokenFor(fakeUser)}`)
        .send({ currentPassword: 'x', newPassword: 'short' })

      expect(res.status).toBe(422)
    })
  })

  // ── Rate limiting ─────────────────────────────────────────────────────────────

  describe('rate limiting on /api/v1/auth/login', () => {
    it('returns 429 after exceeding the attempt limit', async () => {
      db.user.findUnique.mockResolvedValue(null)

      let lastStatus = 200
      for (let i = 0; i < 11; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'nope@losodwyer.com', password: 'whatever123' })
        lastStatus = res.status
      }

      expect(lastStatus).toBe(429)
    })
  })
})
