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

// Mismo criterio que DOCUMENT_TYPE_LABELS — fallback estático, la fuente de
// verdad es documentsApi.getTypes().economicImpactTypes.
export const ECONOMIC_IMPACT_TYPE_LABELS: Record<string, string> = {
  NO_IMPACT: 'No tiene impacto económico',
  INCREASES_COST: 'Aumenta costo',
  DECREASES_COST: 'Reduce costo',
  PENDING_DEFINITION: 'Pendiente de definir',
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

// Status de FireExtinguisherAudit — dominio distinto del status de vencimiento
// del matafuego físico (FIRE_EXT_STATUS_LABELS). PENDING/APPLIED (para el
// status de un proposedChange individual) se resuelven vía PAYMENT_STATUS_LABELS
// y DOCUMENT_STATUS_LABELS, ya definidos más abajo con el texto correcto.
export const FIRE_EXT_AUDIT_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Pendiente de revisión',
  NEEDS_CORRECTION: 'Requiere corrección',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
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
