import { normalizeLicensePlate } from '../normalize'

describe('normalizeLicensePlate', () => {
  it('normaliza patente con espacios', () => {
    expect(normalizeLicensePlate('AB 123 CD')).toBe('AB123CD')
  })

  it('normaliza patente sin espacios', () => {
    expect(normalizeLicensePlate('AB123CD')).toBe('AB123CD')
  })

  it('normaliza patente con guiones', () => {
    expect(normalizeLicensePlate('AB-123-CD')).toBe('AB123CD')
  })

  it('normaliza patente con espacios y guiones mezclados', () => {
    expect(normalizeLicensePlate('AB 123-CD')).toBe('AB123CD')
  })

  it('convierte a mayúsculas', () => {
    expect(normalizeLicensePlate('ab 123 cd')).toBe('AB123CD')
  })

  it('normaliza patente con guiones y minúsculas', () => {
    expect(normalizeLicensePlate('ab-123-cd')).toBe('AB123CD')
  })

  it('hace trim de espacios al inicio y final', () => {
    expect(normalizeLicensePlate('  AB 123 CD  ')).toBe('AB123CD')
  })

  it('devuelve null para null', () => {
    expect(normalizeLicensePlate(null)).toBeNull()
  })

  it('devuelve null para undefined', () => {
    expect(normalizeLicensePlate(undefined)).toBeNull()
  })

  it('devuelve null para string vacío', () => {
    expect(normalizeLicensePlate('')).toBeNull()
  })

  it('devuelve null para string solo con espacios', () => {
    expect(normalizeLicensePlate('   ')).toBeNull()
  })

  it('devuelve null para string solo con guiones', () => {
    expect(normalizeLicensePlate('---')).toBeNull()
  })

  it('maneja patente corta tipo argentina', () => {
    expect(normalizeLicensePlate('A 123 BC')).toBe('A123BC')
  })

  it('maneja patente larga', () => {
    expect(normalizeLicensePlate('ABC 1234 DE')).toBe('ABC1234DE')
  })
})
