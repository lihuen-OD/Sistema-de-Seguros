import { useRenewalProjectionData } from './useRenewalProjectionData'
import { RenewalProjectionLayout } from './RenewalProjectionLayout'

// Calcula lo real de cada activo por CUOTA (dueDate + estado de pago) — el
// mismo criterio que ya usa "Matriz de cuotas" en Análisis Financiero. No
// comparte dataset ni overrides con la versión de Análisis Económico (ver
// RenewalProjectionsEconomicPage.tsx) — son dos números legítimamente
// distintos para el mismo activo.
export default function RenewalProjectionsFinancialPage() {
  const data = useRenewalProjectionData('FINANCIAL')

  return (
    <RenewalProjectionLayout
      {...data}
      title="Proyección de Renovaciones — Financiero"
      subtitle="Estimado por cuotas, según el historial real de cada activo (editable) — nunca modifica pólizas ni comprobantes reales."
      tableSubtitle="Neto/IVA/Otros/%/Ciclo/Cuotas quedan fijos al activo (izquierda) · los meses (derecha) son el resultado, no se editan ahí"
      showInstallmentsColumn
      legend={[
        { label: 'Pagado', colorClass: 'bg-emerald-500' },
        { label: 'Pendiente', colorClass: 'bg-red-500' },
        { label: 'Proyectado', colorClass: 'bg-red-200' },
      ]}
      exportFilenamePrefix="proyeccion-renovaciones-financiero"
    />
  )
}
