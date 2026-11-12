import type { CurrentRateIssue } from '../../../shared/utils/renewalProjectionCalc'

// Textos compartidos entre el layout y el modal de valores anteriores — en
// un archivo propio (no en un componente) para no romper Fast Refresh.

export const RATE_ISSUE_MESSAGES: Record<CurrentRateIssue, string> = {
  missing: 'No hay un tipo de cambio actual configurado en el sistema.',
  invalid: 'El tipo de cambio actual del sistema no es válido.',
  placeholder: 'El tipo de cambio actual es todavía el valor inicial de ejemplo y nunca se actualizó.',
}

export const RATE_UPDATE_HINT = 'Pedí a un usuario con permiso de Configuración que actualice el tipo de cambio actual.'
