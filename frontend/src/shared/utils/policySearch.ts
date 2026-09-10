import type { Policy } from '../types'

// Texto adicional (nunca mostrado, solo para filtrar) que le da al selector de
// pólizas más por qué buscar además del número de póliza — tipo de seguro,
// aseguradora y activos cubiertos — sin ensuciar la etiqueta visible del
// selector con todos estos datos. Mismo patrón que buildAssetSearchKeywords
// (assetSearch.ts). No hay un `insuredName` separado en el tipo Policy del
// frontend — el backend lo mapea directo a `insuranceCompany` (ver mapPolicy
// en policies.api.ts), así que ese campo ya cubre ambos.
export function buildPolicySearchKeywords(policy: Policy): string {
  return [
    policy.policyNumber,
    policy.insuranceCompany,
    ...(policy.insuranceTypeNames ?? []),
    ...(policy.assetNames ?? []),
  ]
    .filter(Boolean)
    .join(' ')
}
