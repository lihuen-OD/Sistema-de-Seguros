// Mantener sincronizado con FIELD_VALIDATION_CONFIG (AuditStep3FieldValidation.tsx)
// y con el literal 'location' del service backend (fire-extinguisher-audits.service.ts).
export const PROPOSED_CHANGE_FIELD_LABELS: Record<string, string> = {
  cylinderNumber: 'Número de cilindro',
  expirationDate: 'Fecha de vencimiento',
  capacity: 'Capacidad',
  type: 'Tipo de agente extintor',
  brand: 'Marca',
  location: 'Ubicación',
}
