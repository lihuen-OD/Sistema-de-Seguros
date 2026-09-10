import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { todayDate, toDateStr } from '../../shared/utils/dates'
import type {
  CreateProducerDTO,
  UpdateProducerDTO,
  ListProducersQueryDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
} from './producers.schemas'

const PRODUCER_INCLUDE = {
  _count: { select: { policies: true, tasks: true } },
}

const PRODUCER_DETAIL_INCLUDE = {
  tasks: { orderBy: [{ status: 'asc' as const }, { dueDate: 'asc' as const }] },
  _count: { select: { policies: true } },
}

// Versión liviana de findById — solo para validar existencia sin traer tasks
// ni _count (findTasks() los descartaba enteros y volvía a pedir las tasks
// por separado).
async function assertProducerExists(id: string) {
  const exists = await prisma.producer.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new AppError(404, 'Productor no encontrado', 'NOT_FOUND')
}

export const producersService = {
  async findAll(query: ListProducersQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
          { matricula: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.producer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: PRODUCER_INCLUDE,
      }),
      prisma.producer.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const producer = await prisma.producer.findUnique({
      where: { id },
      include: PRODUCER_DETAIL_INCLUDE,
    })
    if (!producer) throw new AppError(404, 'Productor no encontrado', 'NOT_FOUND')
    return producer
  },

  async create(data: CreateProducerDTO) {
    if (data.matricula) {
      const exists = await prisma.producer.findUnique({ where: { matricula: data.matricula } })
      if (exists) throw new AppError(409, 'Ya existe un productor con esa matrícula', 'CONFLICT')
    }

    return prisma.producer.create({ data, include: PRODUCER_DETAIL_INCLUDE })
  },

  async update(id: string, data: UpdateProducerDTO) {
    await producersService.findById(id)

    if (data.matricula) {
      const conflict = await prisma.producer.findFirst({
        where: { matricula: data.matricula, id: { not: id } },
      })
      if (conflict)
        throw new AppError(409, 'Ya existe un productor con esa matrícula', 'CONFLICT')
    }

    return prisma.producer.update({ where: { id }, data, include: PRODUCER_DETAIL_INCLUDE })
  },

  async softDelete(id: string) {
    await producersService.findById(id)

    const linkedPolicies = await prisma.policy.count({
      where: { producerId: id, isActive: true },
    })
    if (linkedPolicies > 0) {
      throw new AppError(
        409,
        `No se puede desactivar: el productor tiene ${linkedPolicies} póliza(s) activa(s)`,
        'CONFLICT',
      )
    }

    return prisma.producer.update({ where: { id }, data: { isActive: false } })
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────

  async findTasks(producerId: string) {
    await assertProducerExists(producerId)
    return prisma.producerTask.findMany({
      where: { producerId },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    })
  },

  // Tareas vencidas de TODOS los productores en una sola query — reemplaza,
  // para el Dashboard, el fan-out de 1 GET /producers/:id/tasks por
  // productor. "Vencida" replica exactamente el criterio que ya usaba el
  // frontend (producers.api.ts#mapTaskStatus): status 'pendiente' con
  // dueDate anterior a hoy — no es un valor de `status` real en la base.
  // No filtra por producer.isActive: el Dashboard tampoco lo hacía hoy (su
  // producerQueries.list() no filtra isActive), así que agregar ese filtro acá
  // cambiaría qué tareas se cuentan/muestran respecto al comportamiento actual.
  // `total` siempre es el conteo real (sin `limit`) para que el Dashboard
  // pueda aplicar su propio filtro de alcance del lado del cliente sobre el
  // set completo sin perder precisión — ver ListOverdueTasksQuerySchema.
  async findOverdueTasksForDashboard(limit?: number) {
    const where = { status: 'pendiente', dueDate: { lt: todayDate() } }

    const [total, items] = await Promise.all([
      prisma.producerTask.count({ where }),
      prisma.producerTask.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        ...(limit !== undefined && { take: limit }),
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          status: true,
          producerId: true,
          policyId: true,
          assetId: true,
        },
      }),
    ])

    return {
      total,
      items: items.map((t) => ({ ...t, dueDate: toDateStr(t.dueDate) })),
    }
  },

  async createTask(producerId: string, data: CreateTaskDTO) {
    await producersService.findById(producerId)
    return prisma.producerTask.create({ data: { ...data, producerId } })
  },

  async updateTask(producerId: string, taskId: string, data: UpdateTaskDTO) {
    const task = await prisma.producerTask.findFirst({ where: { id: taskId, producerId } })
    if (!task) throw new AppError(404, 'Tarea no encontrada', 'NOT_FOUND')
    return prisma.producerTask.update({ where: { id: taskId }, data })
  },

  async deleteTask(producerId: string, taskId: string) {
    const task = await prisma.producerTask.findFirst({ where: { id: taskId, producerId } })
    if (!task) throw new AppError(404, 'Tarea no encontrada', 'NOT_FOUND')
    await prisma.producerTask.delete({ where: { id: taskId } })
  },
}
