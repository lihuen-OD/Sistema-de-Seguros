import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../../app'

// Cubre el chequeo de alcance de AUDITOR_MATAFUEGOS agregado en
// auth.middleware.ts — deny-by-default salvo fire-extinguishers,
// fire-extinguisher-audits, catalogs y auth. Los endpoints bloqueados nunca
// llegan a tocar Prisma (el middleware corta antes), así que solo hace
// falta mockear lo que realmente se ejecuta en el caso permitido.
jest.mock('../../../config/database', () => ({
  prisma: {
    fireExtinguisher: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  },
}))

const AUDITOR_ID = '70000000-0000-0000-0000-000000000002'

function auditorToken() {
  return jwt.sign(
    { userId: AUDITOR_ID, role: 'AUDITOR_MATAFUEGOS', email: 'auditor@losodwyer.com' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' },
  )
}

describe('AUDITOR_MATAFUEGOS scope', () => {
  const token = auditorToken()

  it('blocks GET /api/v1/documents', async () => {
    const res = await request(app).get('/api/v1/documents').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('blocks GET /api/v1/policies', async () => {
    const res = await request(app).get('/api/v1/policies').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('blocks GET /api/v1/assets', async () => {
    const res = await request(app).get('/api/v1/assets').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('blocks GET /api/v1/dashboard', async () => {
    const res = await request(app).get('/api/v1/dashboard').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('allows GET /api/v1/fire-extinguishers', async () => {
    const res = await request(app).get('/api/v1/fire-extinguishers').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('does not restrict other roles at all', async () => {
    const adminToken = jwt.sign(
      { userId: 'admin-id', role: 'ADMIN', email: 'admin@losodwyer.com' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' },
    )
    const res = await request(app).get('/api/v1/fire-extinguishers').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})
