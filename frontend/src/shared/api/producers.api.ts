import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Producer, ProducerTask, TaskPriority } from '../types'

interface BackendTask {
  id: string; producerId: string; title: string; description: string | null
  dueDate: string | null; status: string; createdAt: string; updatedAt: string
  completedAt: string | null; priority: string; assignedTo: string | null
  policyId: string | null; assetId: string | null
}
interface BackendProducer {
  id: string; name: string; email: string | null; phone: string | null
  matricula: string | null; address: string | null; isActive: boolean; createdAt: string; updatedAt: string
  tasks?: BackendTask[]
  _count?: { policies: number; tasks: number }
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

interface BackendOverdueTask {
  id: string; title: string; dueDate: string; priority: string; status: string
  producerId: string; policyId: string | null; assetId: string | null
}

// Item liviano de GET /producers/tasks/overdue — a propósito NO es ProducerTask
// completo: el endpoint no trae description/assignedTo/createdAt/completedAt
// porque el Dashboard no los usa (ver DashboardPage.tsx).
export interface OverdueProducerTask {
  id: string
  title: string
  dueDate: string
  priority: TaskPriority
  status: string
  producerId: string
  policyId: string | null
  assetId: string | null
}

export interface OverdueProducerTasksResult {
  total: number
  items: OverdueProducerTask[]
}

const today = () => new Date().toISOString().slice(0, 10)

function mapTaskStatus(s: string, dueDate?: string | null): ProducerTask['status'] {
  if (s === 'completada' || s === 'cancelada') return 'finalizada'
  if (s === 'en_progreso') return 'en_curso'
  if (s === 'pendiente' && dueDate && dueDate < today()) return 'vencida'
  return 'pendiente'
}

function mapTask(t: BackendTask): ProducerTask {
  return {
    id: t.id, title: t.title, description: t.description ?? '',
    producerId: t.producerId,
    policyId: t.policyId ?? null,
    assetId: t.assetId ?? null,
    assignedTo: t.assignedTo ?? null,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
    priority: (t.priority ?? 'media') as TaskPriority,
    status: mapTaskStatus(t.status, t.dueDate),
    createdAt: t.createdAt, completedAt: t.completedAt ?? null,
  }
}

function mapProducer(b: BackendProducer): Producer {
  return {
    id: b.id, name: b.name, email: b.email ?? '', phone: b.phone ?? '',
    registrationNumber: b.matricula ?? '', address: b.address ?? '',
    status: b.isActive ? 'activo' : 'inactivo',
    createdAt: b.createdAt,
  }
}

export interface ProducerInput {
  name: string; email?: string; phone?: string; matricula?: string
  address?: string; isActive?: boolean
}

export const producersApi = {
  async findAll(): Promise<Producer[]> {
    const res = await apiClient.get<Paginated<BackendProducer>>('/producers', { params: { limit: 200 } })
    return res.data.data.map(mapProducer)
  },

  async findById(id: string): Promise<Producer> {
    const res = await apiClient.get<{ data: BackendProducer }>(`/producers/${id}`)
    return mapProducer(res.data.data)
  },

  async create(input: ProducerInput): Promise<Producer> {
    const res = await apiClient.post<{ data: BackendProducer }>('/producers', input)
    return mapProducer(res.data.data)
  },

  async update(id: string, input: Partial<ProducerInput>): Promise<Producer> {
    const res = await apiClient.put<{ data: BackendProducer }>(`/producers/${id}`, input)
    return mapProducer(res.data.data)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/producers/${id}`)
  },

  async findTasks(producerId: string): Promise<ProducerTask[]> {
    const res = await apiClient.get<{ data: BackendTask[] }>(`/producers/${producerId}/tasks`)
    return res.data.data.map(mapTask)
  },

  async createTask(producerId: string, input: {
    title: string; description?: string; dueDate?: string
    priority?: string; assignedTo?: string; policyId?: string; assetId?: string
  }): Promise<ProducerTask> {
    const res = await apiClient.post<{ data: BackendTask }>(`/producers/${producerId}/tasks`, input)
    return mapTask(res.data.data)
  },

  async updateTask(producerId: string, taskId: string, input: Partial<{
    title: string; description?: string; dueDate?: string; status: string
    priority?: string; assignedTo?: string; policyId?: string; assetId?: string
  }>): Promise<ProducerTask> {
    const backendStatusMap: Record<string, string> = {
      en_curso: 'en_progreso',
      finalizada: 'completada',
      vencida: 'pendiente',
    }
    const payload = input.status
      ? { ...input, status: backendStatusMap[input.status] ?? input.status }
      : input
    const res = await apiClient.put<{ data: BackendTask }>(`/producers/${producerId}/tasks/${taskId}`, payload)
    return mapTask(res.data.data)
  },

  async deleteTask(producerId: string, taskId: string): Promise<void> {
    await apiClient.delete(`/producers/${producerId}/tasks/${taskId}`)
  },

  // Tareas vencidas de TODOS los productores en una sola request — reemplaza
  // el fan-out de 1 findTasks() por productor que usaba el Dashboard.
  async findOverdueTasks(limit?: number): Promise<OverdueProducerTasksResult> {
    const res = await apiClient.get<{ data: { total: number; items: BackendOverdueTask[] } }>(
      '/producers/tasks/overdue',
      { params: limit ? { limit } : undefined },
    )
    return {
      total: res.data.data.total,
      items: res.data.data.items.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: (t.priority ?? 'media') as TaskPriority,
        status: t.status,
        producerId: t.producerId,
        policyId: t.policyId,
        assetId: t.assetId,
      })),
    }
  },
}

// ── Query keys / query options (categoría B — semi-dinámico) ────────────────────

export const producerKeys = {
  all: ['producers'] as const,
  detail: (id: string) => [...producerKeys.all, id] as const,
  tasks: (id: string) => [...producerKeys.all, id, 'tasks'] as const,
  overdueTasks: ['producers', 'tasks', 'overdue'] as const,
}

export const producerQueries = {
  list: () =>
    queryOptions({
      queryKey: producerKeys.all,
      queryFn: () => producersApi.findAll(),
      staleTime: 60 * 1000,
      // 'true' (no 'always'): con staleTime de 60s, 'always' casi nunca
      // aportaba nada por sobre 'true' (la mayoría de los regresos de foco
      // ya superan el minuto), pero sí forzaba un refetch en cada vuelta de
      // foco en las 6+ pantallas que consumen esta lista (Dashboard,
      // Pólizas, Detalle de Póliza, etc.) — ver auditoría Performance & RateLimit Fase C.
      refetchOnWindowFocus: true,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: producerKeys.detail(id),
      queryFn: () => producersApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  tasks: (id: string) =>
    queryOptions({
      queryKey: producerKeys.tasks(id),
      queryFn: () => producersApi.findTasks(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
  // Sin `limit` a propósito (ver producersApi.findOverdueTasks) — el
  // Dashboard necesita el set completo para aplicar su propio filtro de
  // alcance por empresa/centro de costo sin perder precisión en el conteo.
  overdueTasks: () =>
    queryOptions({
      queryKey: producerKeys.overdueTasks,
      queryFn: () => producersApi.findOverdueTasks(),
      staleTime: 60 * 1000,
    }),
}
