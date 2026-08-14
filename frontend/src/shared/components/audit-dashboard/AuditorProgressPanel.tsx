import { SectionCard } from '../cards/SectionCard'
import { LevelBar } from '../audit-wizard/LevelBar'

export interface AuditorProgressItem {
  userId: string
  name: string
  completionRate: number | null
  assigned: number
  completed: number
}

interface AuditorProgressPanelProps {
  auditors: AuditorProgressItem[]
  subtitle: string
}

// Compartido por los 3 dashboards de auditoría (matafuegos, rodados, seguros)
// — antes triplicado casi textual, solo cambiaba el subtitle.
export function AuditorProgressPanel({ auditors, subtitle }: AuditorProgressPanelProps) {
  return (
    <SectionCard title="Progreso por auditor" subtitle={subtitle}>
      <div className="space-y-3">
        {auditors.map((a) => (
          <div key={a.userId} className="flex items-center gap-3">
            <LevelBar label={a.name} level={a.completionRate} />
            <span className="flex-shrink-0 text-xs text-slate-400 tabular-nums w-24 text-right">
              {a.assigned > 0 ? `${a.completed} / ${a.assigned}` : 'Sin asignar'}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
