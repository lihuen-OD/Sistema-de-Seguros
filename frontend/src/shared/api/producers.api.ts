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
}
