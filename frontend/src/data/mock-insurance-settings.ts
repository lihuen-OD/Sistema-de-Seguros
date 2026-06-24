export interface CoverageObject {
  id: string
  name: string
}

export interface InsuranceTypeConfig {
  id: string
  label: string
  coverages: string[]
  coverageObjects?: CoverageObject[]
}

export const mockInsuranceTypes: InsuranceTypeConfig[] = [
  {
    id: 'vehiculos',
    label: 'Vehículos',
    coverages: [
      'Responsabilidad Civil (obligatoria)',
      'Terceros Básico',
      'Terceros Completo',
      'Todo Riesgo con franquicia',
      'Robo total',
      'Robo parcial',
      'Incendio total',
      'Incendio parcial',
      'Daños por granizo',
      'Cristales',
      'Cerraduras',
      'Asistencia mecánica',
      'Accidentes personales del conductor',
    ],
  },
  {
    id: 'maquinaria_agricola',
    label: 'Maquinaria agrícola',
    coverages: [
      'Responsabilidad Civil',
      'Robo',
      'Incendio',
      'Daños accidentales',
      'Rotura de maquinaria',
      'Transporte de equipos',
      'Cobertura durante trabajo en campo',
    ],
  },
  {
    id: 'instalaciones_edificios',
    label: 'Instalaciones y edificios',
    coverages: [
      'Incendio',
      'Explosión',
      'Daños por agua',
      'Daños eléctricos',
      'Robo',
      'Cristales',
      'Responsabilidad Civil',
      'Fenómenos climáticos (viento, granizo, tormenta)',
    ],
  },
  {
    id: 'seguros_agropecuarios',
    label: 'Seguros agropecuarios',
    coverages: [
      'Granizo',
      'Granizo con adicionales',
      'Helada',
      'Viento',
      'Inundación',
      'Incendio de cultivos',
      'Resiembra',
      'Multirriesgo agrícola',
    ],
  },
  {
    id: 'produccion_porcina',
    label: 'Producción porcina',
    coverages: [
      'Galpones e instalaciones',
      'Equipamiento',
      'Generadores',
      'Silos',
      'Mortandad de animales',
      'Responsabilidad Civil',
      'Daños por incendio',
      'Daños por tormenta',
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    coverages: [
      'ART',
      'Seguro de Vida Obligatorio',
      'Seguro de Vida Colectivo',
      'Accidentes Personales',
      'Coberturas médicas complementarias',
    ],
  },
  {
    id: 'responsabilidad_civil',
    label: 'Responsabilidad Civil',
    coverages: [
      'Responsabilidad Civil General',
      'Responsabilidad Civil Patronal',
      'Responsabilidad Civil por productos',
      'Responsabilidad Civil ambiental',
      'Responsabilidad Civil para contratistas',
    ],
  },
]
