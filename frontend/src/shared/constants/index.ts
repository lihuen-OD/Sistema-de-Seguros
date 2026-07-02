export const ASSET_TYPES = [
  'Vehículo',
  'Camioneta',
  'Camión',
  'Moto',
  'Tractor',
  'Cosechadora',
  'Pulverizadora',
  'Implemento agrícola',
  'Establecimiento',
  'Edificio',
  'Infraestructura',
  'Equipo',
  'Maquinaria',
  'Carga',
]

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Pago Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
  NOT_APPLICABLE: 'No Aplica',
}

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  ISSUED: 'Emitido',
  APPLIED: 'Aplicado',
  CANCELLED: 'Anulado',
  OBSERVED: 'Observado',
}

// Fallback estático para mostrar el label de un tipo de documento en contextos
// que no consultan documentsApi.getTypes() (fichas PDF, tarjetas de póliza).
// Debe mantenerse en sync con backend/src/modules/documents/document-types.ts
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Factura',
  CREDIT_NOTE: 'Nota de Crédito',
  DEBIT_NOTE: 'Nota de Débito',
  ENDORSEMENT: 'Endoso',
  REBILLING: 'Refacturación',
  ADJUSTMENT_ENTRY: 'Asiento de Ajuste',
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
  baja: 'Baja',
  vendido: 'Vendido',
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

export const PROVINCES = [
  'Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Mendoza', 'San Luis',
  'San Juan', 'Río Negro', 'Neuquén', 'Chubut', 'Santa Cruz', 'Tierra del Fuego',
  'Salta', 'Jujuy', 'Tucumán', 'Santiago del Estero', 'Catamarca', 'La Rioja',
  'Chaco', 'Formosa', 'Misiones', 'Corrientes', 'Ciudad de Buenos Aires',
]

export const EXPIRING_SOON_DAYS = 30
