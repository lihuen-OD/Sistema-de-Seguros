import { useEffect, useState } from 'react'
import { documentsApi } from '../../../../shared/api/documents.api'

// Solo tiene sentido en modo creación — en edición el número de documento es
// de solo lectura (ver DocumentFormRouter), así que `enabled` se pasa en false.
export function useDuplicateDocumentNumberCheck(documentNumber: string, enabled: boolean) {
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
        const { exists } = await documentsApi.checkDocumentNumber(trimmed)
        setDupWarning(exists)
      } catch {
        setDupWarning(false)
      } finally {
        setDupChecking(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [documentNumber, enabled])

  return { dupWarning, dupChecking }
}
