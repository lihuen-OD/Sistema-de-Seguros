export const FIRE_EXT_ESTABLISHMENTS = [
  'LA SUCHO',
  'LA HONORIA',
  'PLANTA',
  'TALLER',
  'OFICINA',
  'OTROS',
] as const

export type FireExtEstablishment = (typeof FIRE_EXT_ESTABLISHMENTS)[number]
