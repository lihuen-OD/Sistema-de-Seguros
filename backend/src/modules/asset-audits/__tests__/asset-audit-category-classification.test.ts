import { classifyAuditableAssetCategory } from '../asset-audit-category-classification'

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
    // Legacy / sin acentos ni espacios — mismo criterio de normalización que classifyAssetType.
    ['camioneta', 'camioneta'],
    ['maquinaria_agricola', 'maquinaria'],
  ])('classifies "%s" as %s', (assetType, expected) => {
    expect(classifyAuditableAssetCategory(assetType)).toBe(expected)
  })

  it.each(['Moto', 'Edificio', 'Establecimiento', 'Equipo', 'Infraestructura', 'Carga Animal', 'Carga Común', ''])(
    'returns null for a non-auditable category "%s"',
    (assetType) => {
      expect(classifyAuditableAssetCategory(assetType)).toBeNull()
    },
  )
})
