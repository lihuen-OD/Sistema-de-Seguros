import type { Producer, ProducerTask } from '../../shared/types'
import { mockProducers, mockProducerTasks } from '../../data/mock-producers'

export const producerRepository = {
  findAll(): Producer[] {
    return [...mockProducers]
  },

  findById(id: string): Producer | undefined {
    return mockProducers.find((p) => p.id === id)
  },

  findActive(): Producer[] {
    return mockProducers.filter((p) => p.status === 'activo')
  },

  findAllTasks(): ProducerTask[] {
    return [...mockProducerTasks]
  },

  findTasksByProducer(producerId: string): ProducerTask[] {
    return mockProducerTasks.filter((t) => t.producerId === producerId)
  },

  findTasksByStatus(status: ProducerTask['status']): ProducerTask[] {
    return mockProducerTasks.filter((t) => t.status === status)
  },

  findTasksByPolicy(policyId: string): ProducerTask[] {
    return mockProducerTasks.filter((t) => t.policyId === policyId)
  },

  getTaskSummaryByProducer(producerId: string) {
    const tasks = mockProducerTasks.filter((t) => t.producerId === producerId)
    return {
      total: tasks.length,
      pendiente: tasks.filter((t) => t.status === 'pendiente').length,
      en_curso: tasks.filter((t) => t.status === 'en_curso').length,
      finalizada: tasks.filter((t) => t.status === 'finalizada').length,
      vencida: tasks.filter((t) => t.status === 'vencida').length,
    }
  },
}
