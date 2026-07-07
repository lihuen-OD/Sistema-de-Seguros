import { resolveCodePrefix } from '../fire-extinguishers.service'

// Regresión directa del bug: PREFIX_MAP usaba claves sin acentuar en minúscula
// pero associatedLocationType llega tal cual desde el catálogo (con acentos y
// mayúscula inicial), por lo que el lookup nunca matcheaba y todo alta caía en GEN.

describe('resolveCodePrefix', () => {
  it('resolves the correct prefix for each real fire_ext_location_type catalog value', () => {
    expect(resolveCodePrefix('Vehículo')).toBe('VEH')
    expect(resolveCodePrefix('Maquinaria')).toBe('MAQ')
    expect(resolveCodePrefix('Establecimiento')).toBe('EST')
    expect(resolveCodePrefix('Edificio')).toBe('EDI')
    expect(resolveCodePrefix('Infraestructura')).toBe('INF')
  })

  it('falls back to GEN for an unknown location type', () => {
    expect(resolveCodePrefix('Otra cosa')).toBe('GEN')
    expect(resolveCodePrefix('')).toBe('GEN')
  })

  it('is robust to case and accent variants of the same catalog label', () => {
    expect(resolveCodePrefix('vehiculo')).toBe('VEH')
    expect(resolveCodePrefix('VEHÍCULO')).toBe('VEH')
    expect(resolveCodePrefix('  Edificio  ')).toBe('EDI')
    expect(resolveCodePrefix('MAQUINARIA')).toBe('MAQ')
  })
})
