import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { PaginatedResult } from './pagination'
import { mapTaskStatus } from '../utils/taskStatus'
import type { TaskPriority, TaskStatus } from '../types'

interface BackendTaskListItem {
  id: string; producerId: string; producerName: string
  title: string; description: string | null; dueDate: string
  status: string; priority: string; assignedTo: string | null
  policyId: string | null; policyNumber: string | null
  assetId: string | null; assetName: string | null
  createdAt: string; updatedAt: string
}

interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

export type BackendTaskStatus = 'pendiente' | 'en_progreso' | 'completada' | 'cancelada'

export interface TaskListItem {
  id: string
  producerId: string
  producerName: string
  title: string
  description: string
  dueDate: string
  // Estado derivado para mostrar (pendiente/en_curso/finalizada/vencida) —
  // mismo mapeo que ya usa producers.api.ts para tareas de un productor.
  status: TaskStatus
  // Estado real de backend, sin mapear — "finalizada" (derivado) puede venir
  // de completada O cancelada, así que no alcanza para preseleccionar el
  // valor correcto en un formulario de edición. Ver TaskEditPage.
  rawStatus: BackendTaskStatus
  priority: TaskPriority
  assignedTo: string | null
  policyId: string | null
  policyNumber: string | null
  assetId: string | null
  assetName: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  producerId: string
  title: string
  description?: string
  dueDate?: string
  status?: BackendTaskStatus
  priority?: TaskPriority
  assignedTo?: string
  policyId?: string | null
  assetId?: string | null
}

// producerId opcional acá, pero si se manda tiene que ser un UUID real — el
// backend rechaza vacío/null (una tarea siempre pertenece a un productor).
export type UpdateTaskInput = Partial<CreateTaskInput>

export interface TaskListFilters {
  page?: number
  limit?: number
  search?: string
  // Vocabulario real de backend — "vencida" no es un status posible acá,
  // usar overdueOnly para eso (ver tasks.schemas.ts en el backend).
  status?: BackendTaskStatus
  priority?: TaskPriority
  producerId?: string
  dueFrom?: string
  dueTo?: string
  overdueOnly?: boolean
}

function mapTaskListItem(t: BackendTaskListItem): TaskListItem {
  return {
    id: t.id,
    producerId: t.producerId,
    producerName: t.producerName,
    title: t.title,
    description: t.description ?? '',
    dueDate: t.dueDate,
    status: mapTaskStatus(t.status, t.dueDate),
    rawStatus: t.status as BackendTaskStatus,
    priority: (t.priority ?? 'media') as TaskPriority,
    assignedTo: t.assignedTo,
    policyId: t.policyId,
    policyNumber: t.policyNumber,
    assetId: t.assetId,
    assetName: t.assetName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

export const tasksApi = {
  async listPaginated(filters: TaskListFilters): Promise<PaginatedResult<TaskListItem>> {
    const res = await apiClient.get<Paginated<BackendTaskListItem>>('/tasks', { params: filters })
    return { data: res.data.data.map(mapTaskListItem), pagination: res.data.pagination }
  },

  // Detalle liviano por id (Fase 2B) — mismo shape que un item del listado,
  // se reusa el mismo mapeo en vez de duplicarlo.
  async findById(id: string): Promise<TaskListItem> {
    const res = await apiClient.get<{ data: BackendTaskListItem }>(`/tasks/${id}`)
    return mapTaskListItem(res.data.data)
  },

  // Escritura global (Fase 2C) — reemplaza, en TaskNewPage/TaskEditPage,
  // producersApi.createTask/updateTask (que tomaban producerId del path y
  // nunca permitían reasignar). Acá producerId viaja en el body.
  async create(input: CreateTaskInput): Promise<TaskListItem> {
    const res = await apiClient.post<{ data: BackendTaskListItem }>('/tasks', input)
    return mapTaskListItem(res.data.data)
  },

  async update(id: string, input: UpdateTaskInput): Promise<TaskListItem> {
    const res = await apiClient.put<{ data: BackendTaskListItem }>(`/tasks/${id}`, input)
    return mapTaskListItem(res.data.data)
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/tasks/${id}`)
  },
}

export const taskKeys = {
  all: ['tasks'] as const,
  detail: (id: string) => [...taskKeys.all, id] as const,
}

export const taskQueries = {
  listPaginated: (filters: TaskListFilters) =>
    queryOptions({
      queryKey: [...taskKeys.all, 'list', filters] as const,
      queryFn: () => tasksApi.listPaginated(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: taskKeys.detail(id),
      queryFn: () => tasksApi.findById(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
}
