import type { FireExtinguisher, FireExtinguisherHistory } from '../../shared/types'
import { mockFireExtinguishers, mockFireExtinguisherHistory } from '../../data/mock-fire-extinguishers'

let extinguishers: FireExtinguisher[] = [...mockFireExtinguishers]
let history: FireExtinguisherHistory[] = [...mockFireExtinguisherHistory]

function computeStatus(expirationDate: string): FireExtinguisher['status'] {
  const [y, m, d] = expirationDate.split('-').map(Number)
  const exp = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return 'vencido'
  if (diffDays <= 30) return 'proximo_vencer'
  return 'vigente'
}

let historyIdSeq = 100

export interface RechargeData {
  chargeDate: string
  expirationDate: string
  observations: string
  technician: string
}

export const fireExtinguisherRepository = {
  findAll(): FireExtinguisher[] {
    return [...extinguishers]
  },

  findById(id: string): FireExtinguisher | undefined {
    return extinguishers.find((f) => f.id === id)
  },

  findByAsset(assetId: string): FireExtinguisher[] {
    return extinguishers.filter((f) => f.associatedAssetId === assetId)
  },

  findByStatus(status: FireExtinguisher['status']): FireExtinguisher[] {
    return extinguishers.filter((f) => f.status === status)
  },

  findByLocationType(type: FireExtinguisher['associatedLocationType']): FireExtinguisher[] {
    return extinguishers.filter((f) => f.associatedLocationType === type)
  },

  findHistoryByExtinguisher(id: string): FireExtinguisherHistory[] {
    return history
      .filter((h) => h.fireExtinguisherId === id)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
  },

  getCountByStatus() {
    return {
      vigente: extinguishers.filter((f) => f.status === 'vigente').length,
      proximo_vencer: extinguishers.filter((f) => f.status === 'proximo_vencer').length,
      vencido: extinguishers.filter((f) => f.status === 'vencido').length,
    }
  },

  search(query: string): FireExtinguisher[] {
    const q = query.toLowerCase()
    return extinguishers.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q) ||
        f.observations.toLowerCase().includes(q),
    )
  },

  // ── Recharge ──────────────────────────────────────────────────────────────

  recharge(id: string, data: RechargeData): FireExtinguisher | null {
    const existing = extinguishers.find((fe) => fe.id === id)
    if (!existing) return null

    const today = new Date().toISOString().slice(0, 10)
    const updated: FireExtinguisher = {
      ...existing,
      chargeDate: data.chargeDate,
      expirationDate: data.expirationDate,
      status: computeStatus(data.expirationDate),
      updatedAt: today,
    }
    extinguishers = extinguishers.map((fe) => (fe.id === id ? updated : fe))

    history = [
      {
        id: `feh-${++historyIdSeq}`,
        fireExtinguisherId: id,
        eventType: 'Recarga',
        eventDate: data.chargeDate,
        previousValue: existing.expirationDate,
        newValue: data.expirationDate,
        observations: data.observations || 'Recarga registrada desde el sistema.',
        createdBy: data.technician || 'Usuario',
      },
      ...history,
    ]

    return updated
  },

  bulkRecharge(ids: string[], data: RechargeData): FireExtinguisher[] {
    return ids
      .map((id) => this.recharge(id, data))
      .filter((fe): fe is FireExtinguisher => fe !== null)
  },
}
