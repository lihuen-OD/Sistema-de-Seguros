import type { Producer, ProducerTask } from '../../shared/types'
import { mockProducers, mockProducerTasks } from '../../data/mock-producers'

let producers: Producer[] = [...mockProducers]
let tasks: ProducerTask[] = [...mockProducerTasks]

export const producerRepository = {
  findAll(): Producer[] {
    return [...producers]
  },

  findById(id: string): Producer | undefined {
    return producers.find((p) => p.id === id)
  },

  findActive(): Producer[] {
    return producers.filter((p) => p.status === 'activo')
  },

  create(data: Omit<Producer, 'id' | 'createdAt'>): Producer {
    const newProducer: Producer = {
      ...data,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
    }
    producers = [...producers, newProducer]
    return newProducer
  },

  update(id: string, data: Partial<Omit<Producer, 'id' | 'createdAt'>>): Producer | null {
    let updated: Producer | null = null
    producers = producers.map((p) => {
      if (p.id !== id) return p
      updated = { ...p, ...data }
      return updated
    })
    return updated
  },

  delete(id: string): boolean {
    const exists = producers.some((p) => p.id === id)
    if (!exists) return false
    producers = producers.filter((p) => p.id !== id)
    return true
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────

  findAllTasks(): ProducerTask[] {
    return [...tasks]
  },

  findTaskById(id: string): ProducerTask | undefined {
    return tasks.find((t) => t.id === id)
  },

  findTasksByProducer(producerId: string): ProducerTask[] {
    return tasks.filter((t) => t.producerId === producerId)
  },

  findTasksByStatus(status: ProducerTask['status']): ProducerTask[] {
    return tasks.filter((t) => t.status === status)
  },

  findTasksByPolicy(policyId: string): ProducerTask[] {
    return tasks.filter((t) => t.policyId === policyId)
  },

  addTask(data: Omit<ProducerTask, 'id' | 'createdAt' | 'completedAt'>): ProducerTask {
    const newTask: ProducerTask = {
      ...data,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      completedAt: null,
    }
    tasks = [newTask, ...tasks]
    return newTask
  },

  updateTask(id: string, data: Partial<Omit<ProducerTask, 'id' | 'createdAt'>>): ProducerTask | null {
    let updated: ProducerTask | null = null
    tasks = tasks.map((t) => {
      if (t.id !== id) return t
      const wasFinished = t.status !== 'finalizada' && data.status === 'finalizada'
      updated = {
        ...t,
        ...data,
        completedAt: wasFinished
          ? new Date().toISOString().slice(0, 10)
          : data.status !== 'finalizada'
          ? null
          : t.completedAt,
      }
      return updated
    })
    return updated
  },

  deleteTask(id: string): boolean {
    const exists = tasks.some((t) => t.id === id)
    if (!exists) return false
    tasks = tasks.filter((t) => t.id !== id)
    return true
  },

  getTaskSummaryByProducer(producerId: string) {
    const pts = tasks.filter((t) => t.producerId === producerId)
    return {
      total: pts.length,
      pendiente: pts.filter((t) => t.status === 'pendiente').length,
      en_curso: pts.filter((t) => t.status === 'en_curso').length,
      finalizada: pts.filter((t) => t.status === 'finalizada').length,
      vencida: pts.filter((t) => t.status === 'vencida').length,
    }
  },
}
