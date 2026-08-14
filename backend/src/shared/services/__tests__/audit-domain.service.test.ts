import { classifyAuditableAssetCategory } from '../audit-domain.service'

describe('classifyAuditableAssetCategory', () => {
  it.each([
    ['Vehículo', 'vehiculo'],
    ['Camioneta', 'camioneta'],
    ['Camión', 'camion'],
    ['Transporte de pasajeros', 'transporte_pasajeros'],
    ['Tractor', 'tractor'],
    ['Cosechadora', 'cosechadora'],
    ['Pulverizadora', 'pulverizadora'],
    ['Implemento', 'implemento'],
    ['Implemento agrícola', 'implemento'],
    ['Maquinaria', 'maquinaria'],
    ['Maquinaria agrícola', 'maquinaria'],
    // "Moto" sí clasifica acá (a diferencia de classifyAssetType) — solo importa
    // para INSURANCE_AUDIT, ver comentario en audit-domain.service.ts.
    ['Moto', 'moto'],
    // Legacy / sin acentos ni espacios — mismo criterio de normalización que classifyAssetType.
    ['camioneta', 'camioneta'],
    ['maquinaria_agricola', 'maquinaria'],
  ])('classifies "%s" as %s', (assetType, expected) => {
    expect(classifyAuditableAssetCategory(assetType)).toBe(expected)
  })

  it.each(['Edificio', 'Establecimiento', 'Equipo', 'Infraestructura', 'Carga Animal', 'Carga Común', ''])(
    'returns null for a non-auditable category "%s"',
    (assetType) => {
      expect(classifyAuditableAssetCategory(assetType)).toBeNull()
    },
  )
})
