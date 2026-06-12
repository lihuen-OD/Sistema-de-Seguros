export const ASSET_TYPES = [
  'Vehículo',
  'Camioneta',
  'Camión',
  'Tractor',
  'Cosechadora',
  'Pulverizadora',
  'Implemento agrícola',
  'Planta industrial',
  'Establecimiento',
  'Edificio',
  'Infraestructura',
  'Equipo',
  'Maquinaria',
]

export const INSURANCE_TYPES = [
  'Automotor',
  'Maquinaria agrícola',
  'Incendio y robo',
  'Responsabilidad civil',
  'Accidentes personales',
  'Combinado agropecuario',
  'Transporte de mercaderías',
  'Seguro técnico',
  'Vida colectivo',
  'Riesgos del trabajo',
]

export const COVERAGE_TYPES = [
  'Terceros completos',
  'Todo riesgo',
  'Parcial',
  'Responsabilidad civil',
  'Cobertura básica',
  'Ampliada',
  'Integral',
]

export const INSURANCE_COMPANIES = [
  'La Segunda',
  'Sancor Seguros',
  'MAPFRE',
  'Zurich',
  'Allianz',
  'SMG Seguros',
  'Seguros Rivadavia',
  'Federación Patronal',
  'Galeno',
  'Meridional',
]

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  factura: 'Factura',
  endoso: 'Endoso',
  nota_credito: 'Nota de Crédito',
  refacturacion: 'Refacturación',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Pago Parcial',
  pagado: 'Pagado',
}

export const POLICY_STATUS_LABELS: Record<string, string> = {
  vigente: 'Vigente',
  proximo_vencer: 'Próx. a Vencer',
  vencida: 'Vencida',
  pendiente_documentacion: 'Pend. Documentación',
  sin_factura: 'Sin Factura',
}

export const ASSET_STATUS_LABELS: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  en_reparacion: 'En Reparación',
  vendido: 'Vendido',
  dado_de_baja: 'Dado de Baja',
  pendiente_documentacion: 'Pend. Documentación',
}

export const FIRE_EXT_STATUS_LABELS: Record<string, string> = {
  vigente: 'Vigente',
  proximo_vencer: 'Próx. a Vencer',
  vencido: 'Vencido',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En Curso',
  finalizada: 'Finalizada',
  vencida: 'Vencida',
}

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const TASK_TYPES = [
  'Solicitar cotización',
  'Renovar póliza',
  'Enviar documentación',
  'Gestionar siniestro',
  'Solicitar endoso',
  'Reclamar documentación',
  'Revisar vencimiento',
]

export const FIRE_EXT_TYPES = [
  'Polvo seco ABC',
  'CO2',
  'Agua',
  'Espuma',
  'Halón',
]

export const FIRE_EXT_CAPACITIES = ['1 kg', '2 kg', '4 kg', '6 kg', '10 kg', '25 kg', '50 kg']

export const LOCATION_TYPES: Record<string, string> = {
  vehiculo: 'Vehículo',
  maquinaria: 'Maquinaria',
  establecimiento: 'Establecimiento',
  edificio: 'Edificio',
  infraestructura: 'Infraestructura',
}

export const PRODUCTIVE_UNITS = [
  'Agrícola Norte',
  'Agrícola Sur',
  'Ganadería',
  'Logística',
  'Administración',
  'Mantenimiento',
]

export const AREAS = [
  'Producción',
  'Administración',
  'Logística',
  'Comercial',
  'Mantenimiento',
  'RRHH',
]

export const EXPIRING_SOON_DAYS = 30

export const CLAIM_TYPE_LABELS: Record<string, string> = {
  accidente: 'Accidente',
  robo: 'Robo',
  incendio: 'Incendio',
  granizo: 'Granizo',
  daños: 'Daños',
  rotura_mecanica: 'Rotura mecánica',
  responsabilidad_civil: 'Responsabilidad civil',
  otro: 'Otro',
}

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  denunciado: 'Denunciado',
  en_tramite: 'En trámite',
  liquidado: 'Liquidado',
  rechazado: 'Rechazado',
  cerrado: 'Cerrado',
}
