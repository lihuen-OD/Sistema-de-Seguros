jest.mock('../../../config/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    fireExtinguisherCreationRequest: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}))

jest.mock('../../fire-extinguishers/fire-extinguishers.service', () => ({
  createFireExtinguisherWithClient: jest.fn(),
}))

import { prisma } from '../../../config/database'
import { createFireExtinguisherWithClient } from '../../fire-extinguishers/fire-extinguishers.service'
import { fireExtinguisherCreationRequestsService, normalizeCylinderNumber } from '../fire-extinguisher-creation-requests.service'

// Prisma está completamente mockeado en este test; el cast permite configurar
// los jest.fn sin arrastrar los tipos del cliente generado a cada fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const createMaster = createFireExtinguisherWithClient as jest.Mock
const input = {
  type: 'ABC', capacity: '5 kg', expirationDate: null, chargeDate: null,
  hydraulicTestExpirationDate: null, associatedAssetId: null,
  associatedLocationType: 'Edificio', location: 'Pasillo', establishment: 'PLANTA',
  brand: 'Marca', cylinderNumber: ' cil- 001 ', iramCertificateNumber: null,
  manufacturingYear: 2024, observations: 'Solicitud',
}
const requestRow = {
  id: '10000000-0000-0000-0000-000000000001', status: 'PENDING', auditPeriod: '2026-10',
  ...input, cylinderNumber: 'cil- 001', cylinderNumberNormalized: 'CIL001',
  requestedBy: 'auditor@example.com', requestedAt: new Date(), reviewedBy: null,
  reviewedAt: null, rejectionReason: null, createdFireExtinguisherId: null,
  createdAt: new Date(), updatedAt: new Date(),
}

function txMock() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    catalogItem: { findMany: jest.fn().mockResolvedValue([
      { category: 'fire_ext_type', label: 'ABC' },
      { category: 'fire_ext_capacity', label: '5 kg' },
      { category: 'fire_ext_location_type', label: 'Edificio' },
      { category: 'fire_ext_establishment', label: 'PLANTA' },
    ]) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', role: 'USER', isActive: true, accessProfile: { modules: ['fire_extinguisher_audit_coverage'] } }) },
    userAuditScope: { findFirst: jest.fn().mockResolvedValue({ id: 'scope-1' }) },
    asset: { findFirst: jest.fn() },
    fireExtinguisherCreationRequest: {
      create: jest.fn().mockResolvedValue(requestRow),
      findUnique: jest.fn().mockResolvedValue(requestRow),
      update: jest.fn(),
    },
  }
}

describe('fire extinguisher creation requests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(txMock()))
  })

  it('normaliza mayúsculas, espacios y guiones de forma estable', () => {
    expect(normalizeCylinderNumber(' cil - 00 1 ')).toBe('CIL001')
  })

  it('impide solicitar un establecimiento fuera del alcance', async () => {
    await expect(fireExtinguisherCreationRequestsService.create(input, 'auditor@example.com', { restricted: true, values: ['OTRO'] }))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('crea solo la solicitud, bajo lock y sin crear inventario', async () => {
    const tx = txMock()
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx))
    const result = await fireExtinguisherCreationRequestsService.create(input, 'auditor@example.com', { restricted: true, values: ['PLANTA'] })
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.fireExtinguisherCreationRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', cylinderNumberNormalized: 'CIL001', requestedBy: 'auditor@example.com' }),
    }))
    expect(createMaster).not.toHaveBeenCalled()
    expect(result.status).toBe('PENDING')
  })

  it('rechaza un activo inyectado por un auditor limitado sin consultar el inventario', async () => {
    await expect(fireExtinguisherCreationRequestsService.create(
      { ...input, associatedAssetId: '30000000-0000-0000-0000-000000000001' },
      'auditor@example.com',
      { restricted: true, values: ['PLANTA'] },
    )).rejects.toMatchObject({ statusCode: 400, code: 'ASSET_NOT_ALLOWED_FOR_ESTABLISHMENT_REQUEST' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('limita el listado del auditor a solicitudes propias', async () => {
    db.fireExtinguisherCreationRequest.findMany.mockResolvedValue([])
    await fireExtinguisherCreationRequestsService.list({}, 'auditor@example.com', false)
    expect(db.fireExtinguisherCreationRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { requestedBy: 'auditor@example.com' } }))
  })

  it('prohíbe siempre la autorevisión', async () => {
    await expect(fireExtinguisherCreationRequestsService.review(requestRow.id, { decision: 'APPROVE' }, 'AUDITOR@example.com'))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(createMaster).not.toHaveBeenCalled()
  })

  it('rechaza con motivo sin crear un matafuego', async () => {
    const tx = txMock()
    tx.fireExtinguisherCreationRequest.update.mockResolvedValue({ ...requestRow, status: 'REJECTED', rejectionReason: 'Datos incorrectos' })
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx))
    const result = await fireExtinguisherCreationRequestsService.review(requestRow.id, { decision: 'REJECT', reason: 'Datos incorrectos' }, 'revisor@example.com')
    expect(result.status).toBe('REJECTED')
    expect(createMaster).not.toHaveBeenCalled()
  })

  it('aprueba con lock, revalidación y alta en la misma transacción', async () => {
    const tx = txMock()
    createMaster.mockResolvedValue({ id: '20000000-0000-0000-0000-000000000001' })
    tx.fireExtinguisherCreationRequest.update.mockResolvedValue({ ...requestRow, status: 'APPROVED', createdFireExtinguisherId: '20000000-0000-0000-0000-000000000001' })
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx))
    await fireExtinguisherCreationRequestsService.review(requestRow.id, { decision: 'APPROVE' }, 'revisor@example.com')
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.catalogItem.findMany).toHaveBeenCalled()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2) // FOR UPDATE + relectura del inventario
    expect(createMaster).toHaveBeenCalledWith(tx, expect.objectContaining({ cylinderNumber: 'cil- 001' }), 'revisor@example.com')
    expect(tx.fireExtinguisherCreationRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }))
  })

  it('impide aprobar si el solicitante perdió el alcance', async () => {
    const tx = txMock()
    tx.userAuditScope.findFirst.mockResolvedValue(null)
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx))
    await expect(fireExtinguisherCreationRequestsService.review(requestRow.id, { decision: 'APPROVE' }, 'revisor@example.com'))
      .rejects.toMatchObject({ statusCode: 409, code: 'STALE_REQUESTER_SCOPE' })
    expect(createMaster).not.toHaveBeenCalled()
  })

  it('una segunda decisión no crea resultados parciales', async () => {
    const tx = txMock()
    tx.fireExtinguisherCreationRequest.findUnique.mockResolvedValue({ ...requestRow, status: 'APPROVED' })
    db.$transaction.mockImplementation(async (callback: (client: unknown) => unknown) => callback(tx))
    await expect(fireExtinguisherCreationRequestsService.review(requestRow.id, { decision: 'APPROVE' }, 'revisor@example.com'))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(createMaster).not.toHaveBeenCalled()
    expect(tx.fireExtinguisherCreationRequest.update).not.toHaveBeenCalled()
  })
})
