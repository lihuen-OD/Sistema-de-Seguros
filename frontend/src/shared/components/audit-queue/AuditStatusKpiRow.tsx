import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { MetricGrid } from '../cards/MetricGrid'
import { KpiCard } from '../cards/KpiCard'

export interface AuditStatusCounts {
  SUBMITTED: number
  NEEDS_CORRECTION: number
  APPROVED: number
  REJECTED: number
}

interface AuditStatusKpiRowProps {
  counts: AuditStatusCounts
  onStatusClick: (status: keyof AuditStatusCounts) => void
  // Seguros no tiene el concepto de "cambios propuestos" aplicados al
  // maestro — sus descripciones de Aprobadas/Rechazadas son distintas de
  // Matafuegos/Rodados, que sí lo tienen.
  approvedDescription?: string
  rejectedDescription?: string
}

export function AuditStatusKpiRow({
  counts,
  onStatusClick,
  approvedDescription = 'Cambios aplicados al maestro',
  rejectedDescription = 'Sin cambios aplicados',
}: AuditStatusKpiRowProps) {
  return (
    <MetricGrid cols={4} className="mb-5">
      <KpiCard
        label="Pendientes de revisión"
        value={counts.SUBMITTED}
        description="Esperando decisión"
        icon={ClipboardCheck}
        variant="info"
        onClick={() => onStatusClick('SUBMITTED')}
      />
      <KpiCard
        label="Requieren corrección"
        value={counts.NEEDS_CORRECTION}
        description="Devueltas al auditor"
        icon={AlertTriangle}
        variant="warning"
        onClick={() => onStatusClick('NEEDS_CORRECTION')}
      />
      <KpiCard
        label="Aprobadas"
        value={counts.APPROVED}
        description={approvedDescription}
        icon={CheckCircle2}
        variant="success"
        onClick={() => onStatusClick('APPROVED')}
      />
      <KpiCard
        label="Rechazadas"
        value={counts.REJECTED}
        description={rejectedDescription}
        icon={XCircle}
        variant="danger"
        onClick={() => onStatusClick('REJECTED')}
      />
    </MetricGrid>
  )
}
