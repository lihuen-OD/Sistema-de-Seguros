import { useRenewalProjectionData } from './useRenewalProjectionData'
import { RenewalProjectionLayout } from './RenewalProjectionLayout'

// Calcula lo real de cada activo por DOCUMENTO (issueDate + monto asignado)
// — el mismo criterio que ya usa buildEconomicMatrix en Análisis Económico.
// No hay pagado/pendiente acá: un documento emitido ya está "reconocido",
// sin importar si se cobró. No comparte dataset ni overrides con la versión
// de Análisis Financiero (ver RenewalProjectionsFinancialPage.tsx).
export default function RenewalProjectionsEconomicPage() {
  const data = useRenewalProjectionData('ECONOMIC')

  return (
    <RenewalProjectionLayout
      {...data}
      title="Proyección de Renovaciones — Económico"
      subtitle="Estimado por documento emitido, según el historial real de cada activo (editable) — nunca modifica pólizas ni comprobantes reales."
      tableSubtitle="Neto/IVA/Otros/%/Ciclo quedan fijos al activo (izquierda) · los meses (derecha) son el resultado, no se editan ahí"
      showInstallmentsColumn={false}
      legend={[
        { label: 'Reconocido', colorClass: 'bg-sky-500' },
        { label: 'Proyectado', colorClass: 'bg-red-200' },
      ]}
      exportFilenamePrefix="proyeccion-renovaciones-economico"
    />
  )
}
