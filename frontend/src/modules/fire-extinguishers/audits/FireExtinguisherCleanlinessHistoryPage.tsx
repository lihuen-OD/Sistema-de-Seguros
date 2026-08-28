import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { LoadingState } from '../../../shared/components/empty-states/LoadingState'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import type { AvailableAuditPeriod } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'
import { CleanlinessHistoryPeriodPicker } from './CleanlinessHistoryPeriodPicker'
import { CleanlinessHistoryTable } from './CleanlinessHistoryTable'

// Selección inicial al entrar a la pantalla: el mes de la pista (?period=,
// el que se estaba viendo en el informe de auditoría) y los 5 anteriores —
// una ventana de 6 meses terminando ahí. Si no hay pista o no está entre los
// disponibles, los 6 más recientes. `periods` viene ordenado desc.
function defaultSelection(periods: string[], hint: string | null): string[] {
  if (periods.length === 0) return []
  const anchorIndex = hint ? periods.indexOf(hint) : -1
  if (anchorIndex === -1) return periods.slice(0, 6)
  return periods.slice(anchorIndex, anchorIndex + 6)
}

export default function FireExtinguisherCleanlinessHistoryPage() {
  const [searchParams] = useSearchParams()
  const periodHint = searchParams.get('period')
  const { data: availablePeriods, isLoading: loadingPeriods } = useQuery(fireExtinguisherAuditQueries.availablePeriods())

  return (
    <PageContent>
      <PageHeader
        title="Historial de limpieza"
        subtitle="Nivel de limpieza por sector, cruzando varios meses a la vez"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS_AUDIT_FINDINGS_REPORT}
        backLabel="Volver al informe de auditoría"
      />

      {loadingPeriods ? (
        <SectionCard title="Meses a comparar">
          <LoadingState rows={3} />
        </SectionCard>
      ) : !availablePeriods || availablePeriods.length === 0 ? (
        <SectionCard title="Meses a comparar">
          <EmptyState
            title="Todavía no hay auditorías cargadas"
            description="El historial va a aparecer a medida que se carguen auditorías mensuales."
          />
        </SectionCard>
      ) : (
        // key con la cantidad de períodos disponibles: si aparece uno nuevo
        // (auditoría de un mes que antes no existía) se vuelve a derivar la
        // selección inicial en vez de quedar con una ventana desactualizada.
        <CleanlinessHistoryContent
          key={availablePeriods.length}
          availablePeriods={availablePeriods}
          periodHint={periodHint}
        />
      )}
    </PageContent>
  )
}

interface CleanlinessHistoryContentProps {
  availablePeriods: AvailableAuditPeriod[]
  periodHint: string | null
}

function CleanlinessHistoryContent({ availablePeriods, periodHint }: CleanlinessHistoryContentProps) {
  // Estado derivado de datos ya disponibles al montar (ver key en el
  // caller) — sin useEffect, no es una sincronización posterior.
  const [selected, setSelected] = useState<string[]>(() =>
    defaultSelection(
      availablePeriods.map((p) => p.period),
      periodHint,
    ),
  )

  const {
    data: history,
    isLoading: loadingHistory,
    isError,
  } = useQuery(fireExtinguisherAuditQueries.cleanlinessHistory(selected))

  return (
    <>
      <SectionCard title="Meses a comparar" className="mb-5">
        <CleanlinessHistoryPeriodPicker availablePeriods={availablePeriods} selected={selected} onChange={setSelected} />
      </SectionCard>

      <SectionCard noPadding>
        {selected.length === 0 ? (
          <EmptyState
            icon={History}
            title="Seleccioná al menos un mes"
            description="Tildá uno o más meses arriba para ver el nivel de limpieza de cada sector."
          />
        ) : loadingHistory ? (
          <LoadingState rows={6} />
        ) : isError || !history ? (
          <ErrorState description="No se pudo cargar el historial de limpieza. Intentá nuevamente." />
        ) : history.sectors.length === 0 ? (
          <EmptyState title="Sin sectores para mostrar" description="No hay matafuegos activos en los meses seleccionados." />
        ) : (
          <CleanlinessHistoryTable periods={history.periods} sectors={history.sectors} />
        )}
      </SectionCard>
    </>
  )
}
