import { isPledgeEligibleAssetType } from '../asset-pledge-eligibility'

describe('isPledgeEligibleAssetType', () => {
  it.each([
    'vehiculo', 'Vehículo', 'camioneta', 'camion', 'moto', 'transporte_pasajeros',
    'Transporte de pasajeros', 'tractor', 'cosechadora', 'pulverizadora',
    'implemento', 'implemento_agricola', 'maquinaria', 'maquinaria_agricola',
  ])('habilita %s', (assetType) => {
    expect(isPledgeEligibleAssetType(assetType)).toBe(true)
  })

  it.each([
    'edificio', 'establecimiento', 'campo_terreno', 'equipo', 'infraestructura',
    'carga_animal', 'carga_comun', 'inmueble', 'silo', 'tipo ambiguo', '',
  ])('rechaza %s', (assetType) => {
    expect(isPledgeEligibleAssetType(assetType)).toBe(false)
  })
})
