import type { TableColumn } from '../../types'
import { StatusPill } from '../badges/StatusPill'
import { formatDate } from '../../utils/format'

// Columnas idénticas entre los 3 dominios de auditoría (Matafuegos/Rodados/
// Seguros) — extraídas acá para no repetir el mismo render/label 3 veces.
// Copiadas tal cual de FireExtinguisherAuditsQueuePage.tsx (fuente original),
// sin cambiar id/key/label/comportamiento.

// Orden por flujo de trabajo al ordenar la columna "Estado" — alfabético
// mezclaría aprobadas/rechazadas (ya resueltas) con las que todavía requieren
// acción, que no es el orden que espera un revisor. Coincide con el orden de
// las KPI cards de AuditStatusKpiRow.
export const AUDIT_STATUS_SORT_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  NEEDS_CORRECTION: 1,
  APPROVED: 2,
  REJECTED: 3,
}

export function buildAuditPeriodColumn<T extends { auditPeriod: string }>(): TableColumn<T> {
  return {
    id: 'auditPeriod',
    key: 'auditPeriod',
    label: 'Período',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-600">{v as string}</span>,
  }
}

export function buildAuditedByColumn<T extends { auditedBy: string }>(): TableColumn<T> {
  return {
    id: 'auditedBy',
    key: 'auditedBy',
    label: 'Auditor',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-600">{v as string}</span>,
  }
}

export function buildAuditDateColumn<T extends { auditDate: string }>(): TableColumn<T> {
  return {
    id: 'auditDate',
    key: 'auditDate',
    label: 'Fecha',
    sortable: true,
    render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
  }
}

export function buildAuditStatusColumn<T extends { status: string }>(): TableColumn<T> {
  return {
    id: 'status',
    key: 'status',
    label: 'Estado',
    sortable: true,
    sortValue: (row) => AUDIT_STATUS_SORT_ORDER[row.status] ?? 99,
    render: (v) => <StatusPill status={v as string} size="sm" />,
  }
}
