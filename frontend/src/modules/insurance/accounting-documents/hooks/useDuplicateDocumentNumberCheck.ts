import { useEffect, useState } from 'react'
import { documentsApi } from '../../../../shared/api/documents.api'

// Se usa tanto al crear como al editar (el número de documento se puede
// corregir después del alta — ver DocumentFormRouter). `excludeId` es el id
// del propio documento cuando se edita, para que su número sin cambios no
// se marque como "ya existe" contra sí mismo.
//
// El duplicado real (ver documents.service.ts::create/update) es la
// combinación documentType + insuranceCompany + documentNumber, no el número
// solo — dos compañías (o dos tipos de documento) pueden compartir
// numeración. Por eso este hook necesita documentType/insuranceCompany
// además del número: de lo contrario mostraría una advertencia de duplicado
// en casos que el backend permite sin problema.
export function useDuplicateDocumentNumberCheck(
  documentNumber: string,
  enabled: boolean,
  documentType?: string,
  insuranceCompany?: string,
  excludeId?: string,
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
        const { exists } = await documentsApi.checkDocumentNumber(trimmed, documentType, insuranceCompany, excludeId)
        setDupWarning(exists)
      } catch {
        setDupWarning(false)
      } finally {
        setDupChecking(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [documentNumber, enabled, documentType, insuranceCompany, excludeId])

  return { dupWarning, dupChecking }
}
