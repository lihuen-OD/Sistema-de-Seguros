import { Resend } from 'resend'
import { env } from '../../config/env'
import type { EmailProvider } from './email.provider'
import type { EmailProviderSendResult, NormalizedEmailPayload } from './email.types'

let _client: Resend | null = null

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY no configurada')
  }
  if (!_client) {
    _client = new Resend(env.RESEND_API_KEY)
  }
  return _client
}

// Único punto del backend que importa el SDK de Resend — todo lo demás pasa
// por la interfaz EmailProvider. Nunca deja escapar el objeto crudo del SDK.
export class ResendEmailProvider implements EmailProvider {
  async send(payload: NormalizedEmailPayload): Promise<EmailProviderSendResult> {
    try {
      const client = getClient()
      const { data, error } = await client.emails.send({
        from: payload.from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      })

      if (error) {
        return { success: false, errorMessage: error.message }
      }

      return { success: true, providerMessageId: data?.id }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al enviar el email'
      return { success: false, errorMessage: message }
    }
  }
}
