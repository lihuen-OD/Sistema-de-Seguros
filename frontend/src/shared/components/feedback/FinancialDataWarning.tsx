import { DataWarning } from './DataWarning'
import type { FinancialDocumentResult } from '../../api/documents.api'

export function FinancialDataWarning({ result }: { result?: FinancialDocumentResult }) {
  if (!result || (result.truncationKnown && !result.truncated)) return null

  return (
    <DataWarning>
      {result.truncationKnown
        ? `Se alcanzó el límite técnico de ${result.limit?.toLocaleString('es-AR') ?? 'documentos'} financieros. Los importes históricos de esta vista son parciales y no deben interpretarse como definitivos.`
        : 'El servidor no informó si se alcanzó el límite de documentos financieros. Los importes históricos de esta vista podrían estar incompletos y no deben interpretarse como definitivos.'}
    </DataWarning>
  )
}
