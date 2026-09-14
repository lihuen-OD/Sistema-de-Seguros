import type { Producer } from '../types'

// Texto adicional (nunca mostrado, solo para filtrar) que le da al selector
// de productores más por qué buscar además del nombre — matrícula, email y
// teléfono. Mismo patrón que buildAssetSearchKeywords/buildPolicySearchKeywords.
export function buildProducerSearchKeywords(producer: Producer): string {
  return [producer.name, producer.registrationNumber, producer.email, producer.phone]
    .filter(Boolean)
    .join(' ')
}
