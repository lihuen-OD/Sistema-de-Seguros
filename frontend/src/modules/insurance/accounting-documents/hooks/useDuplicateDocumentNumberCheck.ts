import { useEffect, useState } from 'react'
import { documentsApi } from '../../../../shared/api/documents.api'

// Solo tiene sentido en modo creación — en edición el número de documento es
// de solo lectura (ver DocumentFormRouter), así que `enabled` se pasa en false.
//
// El duplicado real (ver documents.service.ts::create) es la combinación
// documentType + insuranceCompany + documentNumber, no el número solo — dos
// compañías (o dos tipos de documento) pueden compartir numeración. Por eso
// este hook necesita documentType/insuranceCompany además del número: de lo
// contrario mostraría una advertencia de duplicado en casos que el backend
// permite sin problema.
export function useDuplicateDocumentNumberCheck(
  documentNumber: string,
  enabled: boolean,
  documentType?: string,
  insuranceCompany?: string,
) {
  const [dupWarning, setDupWarning] = useState(false)
  const [dupChecking, setDupChecking] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setDupWarning(false)
      return
    }
    const trimmed = documentNumber.trim()
    if (!trimmed) {
      setDupWarning(false)
      return
    }
    setDupChecking(true)
    const timer = setTimeout(async () => {
      try {
        const { exists } = await documentsApi.checkDocumentNumber(trimmed, documentType, insuranceCompany)
        setDupWarning(exists)
      } catch {
        setDupWarning(false)
      } finally {
        setDupChecking(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [documentNumber, enabled, documentType, insuranceCompany])

  return { dupWarning, dupChecking }
}
