import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { todayDate, toDateStr } from '../../shared/utils/dates'
import type { ListTasksQueryDTO } from './tasks.schemas'

export const tasksService = {
  // Listado global paginado (Fase 2A) — reemplaza, en ProducerTasksPage, el
  // fan-out de 1 GET /producers + N GET /producers/:id/tasks. policyId/assetId
  // no tienen relación Prisma declarada en ProducerTask (son columnas sueltas,
  // no @relation) — se resuelven con 2 findMany acotados a los ids de la
  // página actual (≤ `limit` cada uno), no un lookup por fila.
  async findAll(query: ListTasksQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const conditions: Prisma.ProducerTaskWhereInput[] = []
    if (query.status) conditions.push({ status: query.status })
    if (query.priority) conditions.push({ priority: query.priority })
    if (query.producerId) conditions.push({ producerId: query.producerId })
    if (query.dueFrom || query.dueTo) {
      conditions.push({
        dueDate: {
          ...(query.dueFrom && { gte: query.dueFrom }),
          ...(query.dueTo && { lte: query.dueTo }),
        },
      })
    }
    // Mismo criterio que producers.service.ts#findOverdueTasksForDashboard —
    // no se extrae a un helper compartido a propósito: es un objeto literal
    // de 2 campos, y este módulo se creó deliberadamente separado de
    // producers (ver auditoría Fase 2), no para acoplarse a él de nuevo.
    if (query.overdueOnly) conditions.push({ status: 'pendiente', dueDate: { lt: todayDate() } })
    const search = query.search?.trim()
    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { assignedTo: { contains: search, mode: 'insensitive' } },
          { producer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }
    const where: Prisma.ProducerTaskWhereInput = conditions.length > 0 ? { AND: conditions } : {}

    const [rows, total] = await Promise.all([
      prisma.producerTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: { producer: { select: { name: true } } },
      }),
      prisma.producerTask.count({ where }),
    ])

    const policyIds = [...new Set(rows.map((r) => r.policyId).filter((v): v is string => !!v))]
    const assetIds = [...new Set(rows.map((r) => r.assetId).filter((v): v is string => !!v))]

    const [policies, assets] = await Promise.all([
      policyIds.length > 0
        ? prisma.policy.findMany({ where: { id: { in: policyIds } }, select: { id: true, policyNumber: true } })
        : Promise.resolve([]),
      assetIds.length > 0
        ? prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ])
    const policyNumberById = new Map(policies.map((p) => [p.id, p.policyNumber]))
    const assetNameById = new Map(assets.map((a) => [a.id, a.name]))

    const data = rows.map((t) => ({
      id: t.id,
      producerId: t.producerId,
      producerName: t.producer.name,
      title: t.title,
      description: t.description,
      dueDate: toDateStr(t.dueDate),
      status: t.status,
      priority: t.priority,
      assignedTo: t.assignedTo,
      policyId: t.policyId,
      policyNumber: t.policyId ? policyNumberById.get(t.policyId) ?? null : null,
      assetId: t.assetId,
      assetName: t.assetId ? assetNameById.get(t.assetId) ?? null : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))

    return buildPaginatedResponse(data, total, { page, limit })
  },
}
