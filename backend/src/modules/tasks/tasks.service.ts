import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { todayDate, toDateStr } from '../../shared/utils/dates'
import type { ListTasksQueryDTO } from './tasks.schemas'

const TASK_WITH_PRODUCER_INCLUDE = { producer: { select: { name: true } } }

type TaskWithProducer = Prisma.ProducerTaskGetPayload<{ include: typeof TASK_WITH_PRODUCER_INCLUDE }>

// Mismo shape liviano en el listado y en el detalle (Fase 2A/2B) — una sola
// definición de qué campos expone un "documento vinculado" de tarea, para no
// tener el payload de /tasks y el de /tasks/:id divergiendo con el tiempo.
function mapTaskRow(t: TaskWithProducer, policyNumber: string | null, assetName: string | null) {
  return {
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
    policyNumber,
    assetId: t.assetId,
    assetName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

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
        include: TASK_WITH_PRODUCER_INCLUDE,
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

    const data = rows.map((t) => mapTaskRow(
      t,
      t.policyId ? policyNumberById.get(t.policyId) ?? null : null,
      t.assetId ? assetNameById.get(t.assetId) ?? null : null,
    ))

    return buildPaginatedResponse(data, total, { page, limit })
  },

  // Detalle liviano por id (Fase 2B) — reemplaza, en TaskDetailPage, el
  // fan-out de productores + tareas por productor + listados completos de
  // pólizas/activos solo para resolver 2 nombres. policyId/assetId se
  // resuelven con 1 findUnique cada uno (solo si la tarea los tiene) — nunca
  // un listado completo.
  async findById(id: string) {
    const task = await prisma.producerTask.findUnique({
      where: { id },
      include: TASK_WITH_PRODUCER_INCLUDE,
    })
    if (!task) throw new AppError(404, 'Tarea no encontrada', 'NOT_FOUND')

    const [policy, asset] = await Promise.all([
      task.policyId
        ? prisma.policy.findUnique({ where: { id: task.policyId }, select: { policyNumber: true } })
        : Promise.resolve(null),
      task.assetId
        ? prisma.asset.findUnique({ where: { id: task.assetId }, select: { name: true } })
        : Promise.resolve(null),
    ])

    return mapTaskRow(task, policy?.policyNumber ?? null, asset?.name ?? null)
  },
}
