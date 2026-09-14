import type { TaskStatus } from '../types'

const today = () => new Date().toISOString().slice(0, 10)

// Deriva el estado que ve el usuario a partir del estado real de backend
// (pendiente/en_progreso/completada/cancelada) — "vencida" no existe como tal
// en la base, se calcula acá. Único lugar donde vive esta regla: reusado por
// producers.api.ts (tareas de un productor) y tasks.api.ts (listado global),
// para no tener dos criterios de "vencida" que puedan desalinearse.
export function mapTaskStatus(status: string, dueDate?: string | null): TaskStatus {
  if (status === 'completada' || status === 'cancelada') return 'finalizada'
  if (status === 'en_progreso') return 'en_curso'
  if (status === 'pendiente' && dueDate && dueDate < today()) return 'vencida'
  return 'pendiente'
}
