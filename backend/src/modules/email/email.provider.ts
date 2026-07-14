import type { EmailProviderSendResult, NormalizedEmailPayload } from './email.types'

// Desacople del proveedor real — nada fuera de este módulo debe importar el
// SDK de Resend (ni de cualquier otro proveedor futuro) directamente.
export interface EmailProvider {
  send(payload: NormalizedEmailPayload): Promise<EmailProviderSendResult>
}
