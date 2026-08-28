import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'
import type { CleanlinessHistorySector, CleanlinessHistoryExtinguisher } from '../../../shared/api/fire-extinguisher-audits.api'
import { formatPeriodLabelShort, groupByEstablishment, sectorKey } from './findingsReportFields'
import { levelHeatStyle } from '../../../shared/utils/auditLevel'
import { CLEANLINESS_OPTIONS, optionLabel } from '../../../shared/components/audit-wizard/checklistConfig'

interface CleanlinessHistoryTableProps {
  periods: string[]
  sectors: CleanlinessHistorySector[]
}

function HeatCell({ level, levelLabel, title }: { level: number | null; levelLabel: string | null; title: string }) {
  const style = levelHeatStyle(levelLabel)
  return (
    <td className="px-2 py-2 border-b border-slate-100 text-center">
      <div title={title} className={clsx('mx-auto rounded-md px-2 py-1 text-xs font-semibold tabular-nums w-14', style.bg, style.text)}>
        {level != null ? `${level.toFixed(0)}%` : '—'}
      </div>
    </td>
  )
}

function ExtinguisherRow({ extinguisher }: { extinguisher: CleanlinessHistoryExtinguisher }) {
  const label = extinguisher.location ?? extinguisher.cylinderNumber
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-slate-50/60 text-slate-500 pl-8 pr-3 py-1.5 border-b border-slate-100 whitespace-nowrap text-xs">
        {label}
      </td>
      {extinguisher.cells.map((cell) => (
        <HeatCell
          key={cell.period}
          level={cell.level}
          levelLabel={cell.levelLabel}
          title={
            cell.cleanliness != null
              ? `${label} — ${formatPeriodLabelShort(cell.period)}: ${optionLabel(CLEANLINESS_OPTIONS, cell.cleanliness)}`
              : `${label} — ${formatPeriodLabelShort(cell.period)}: sin auditoría este mes`
          }
        />
      ))}
    </tr>
  )
}

// Heatmap sector × mes — filas agrupadas por establecimiento, columnas =
// meses tildados en el picker, celda coloreada por nivel de limpieza (mismos
// 4 colores que ya usa Badge.tsx). `overflow-x-auto` + primera columna
// `sticky` porque el ancho de la tabla crece con la cantidad de meses
// elegidos y puede superar el viewport fácilmente. Cada sector se puede
// desplegar para ver el detalle por matafuego (mismo % + color, con el
// estado exacto del checklist en el tooltip — un % solo no distingue "muy
// sucio" de "suciedad acumulada", ambos puntúan igual).
export function CleanlinessHistoryTable({ periods, sectors }: CleanlinessHistoryTableProps) {
  const groups = groupByEstablishment(sectors)
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set())

  function toggleSector(key: string) {
    setExpandedSectors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 border-b border-slate-200">
              Sector
            </th>
            {periods.map((period) => (
              <th
                key={period}
                className="text-center text-xs font-semibold text-slate-500 px-2 py-2 border-b border-slate-200 whitespace-nowrap"
              >
                {formatPeriodLabelShort(period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.establishment}>
              <tr>
                <td colSpan={periods.length + 1} className="bg-slate-50 text-xs font-semibold text-slate-600 px-3 py-1.5 border-b border-slate-100">
                  {group.establishment}
                </td>
              </tr>
              {group.items.map((sector) => {
                const key = sectorKey(sector.establishment, sector.locationType)
                const expanded = expandedSectors.has(key)
                return (
                  <Fragment key={key}>
                    <tr>
                      <td className="sticky left-0 z-10 bg-white text-slate-700 px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleSector(key)}
                          className="flex items-center gap-1.5 hover:text-brand-700 transition-colors"
                          title={expanded ? 'Ocultar matafuegos' : 'Ver matafuegos de este sector'}
                        >
                          {expanded ? (
                            <ChevronUp size={13} className="text-slate-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                          )}
                          <span className="font-medium">{sector.locationType}</span>
                          <span className="text-xs text-slate-400">({sector.total})</span>
                        </button>
                      </td>
                      {sector.cells.map((cell) => (
                        <HeatCell
                          key={cell.period}
                          level={cell.level}
                          levelLabel={cell.levelLabel}
                          title={
                            cell.level != null
                              ? `${sector.locationType} — ${formatPeriodLabelShort(cell.period)}: ${cell.level.toFixed(0)}% (${cell.levelLabel}), ${cell.audited} auditado${cell.audited !== 1 ? 's' : ''}`
                              : `${sector.locationType} — ${formatPeriodLabelShort(cell.period)}: sin auditorías este mes`
                          }
                        />
                      ))}
                    </tr>
                    {expanded && sector.extinguishers.map((ext) => <ExtinguisherRow key={ext.cylinderNumber} extinguisher={ext} />)}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
