import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'
import { ResendEmailProvider } from './resend.provider'
import type { EmailProvider } from './email.provider'
import type { SendEmailInput, SendEmailResult, SendManualEntityEmailInput } from './email.types'
import { buildManualDocumentSendEmail, type ManualDocumentEmailData } from './email.templates'

// Previene header injection — un `\r`/`\n` en subject/replyTo podría inyectar
// headers SMTP adicionales en proveedores que arman el mensaje crudo.
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function resolveFrom(type: SendEmailInput['type']): string {
  if (type === 'MANUAL_DOCUMENT_SEND') return env.EMAIL_FROM_MANUAL
  if (
    type === 'EXPIRATION_SUMMARY' ||
    type === 'ATTACHMENT_EXPIRATION' ||
    type === 'POLICY_EXPIRATION' ||
    type === 'FIRE_EXTINGUISHER_EXPIRATION'
  ) {
    return env.EMAIL_FROM_NOTIFICATIONS
  }
  return env.EMAIL_FROM_DEFAULT
}

let _provider: EmailProvider | null = null
function getProvider(): EmailProvider {
  if (!_provider) _provider = new ResendEmailProvider()
  return _provider
}

export const emailService = {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const to = input.to.map(sanitizeHeaderValue)
    const cc = input.cc?.map(sanitizeHeaderValue).filter(Boolean)
    const bcc = input.bcc?.map(sanitizeHeaderValue).filter(Boolean)
    const subject = sanitizeHeaderValue(input.subject)
    const replyTo = input.replyTo ? sanitizeHeaderValue(input.replyTo) : undefined
    const from = resolveFrom(input.type)

    // EMAIL_FORCE_TO redirige todo envío al destinatario forzado (uso en
    // desarrollo/demo) — el destinatario real nunca recibe nada en ese modo.
    const forced = env.EMAIL_FORCE_TO ? sanitizeHeaderValue(env.EMAIL_FORCE_TO) : undefined
    const effectiveTo = forced ? [forced] : to
    const effectiveCc = forced ? undefined : cc
    const effectiveBcc = forced ? undefined : bcc

    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) }
    if (forced) {
      metadata.originalTo = to
      if (cc?.length) metadata.originalCc = cc
      if (bcc?.length) metadata.originalBcc = bcc
    }
    if (input.attachments?.length) {
      // Nombres únicamente — nunca el contenido de los archivos en el log.
      metadata.attachmentNames = input.attachments.map((a) => a.filename)
    }
    if (env.EMAIL_LOG_BODY) {
      metadata.html = input.html
    }

    const baseLogData = {
      type: input.type,
      provider: env.EMAIL_PROVIDER,
      fromAddress: from,
      toAddresses: effectiveTo,
      ccAddresses: effectiveCc ?? [],
      bccAddresses: effectiveBcc ?? [],
      replyTo: replyTo ?? null,
      subject,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      triggeredByUserId: input.actor?.userId ?? null,
      triggeredByEmail: input.actor?.email ?? null,
      metadata: (Object.keys(metadata).length > 0 ? metadata : undefined) as Prisma.InputJsonValue | undefined,
    }

    if (!env.EMAIL_ENABLED) {
      await prisma.emailLog.create({ data: { ...baseLogData, status: 'SKIPPED' } })
      return { sent: false, status: 'SKIPPED', to: effectiveTo }
    }

    const result = await getProvider().send({
      from,
      to: effectiveTo,
      cc: effectiveCc,
      bcc: effectiveBcc,
      replyTo,
      subject,
      html: input.html,
      attachments: input.attachments,
    })

    if (!result.success) {
      await prisma.emailLog.create({
        data: {
          ...baseLogData,
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: result.errorMessage ?? 'Error desconocido',
        },
      })
      // El detalle técnico queda en EmailLog — al cliente solo un mensaje genérico.
      throw new AppError(502, 'No se pudo enviar el email. Intentá nuevamente en unos minutos.', 'EMAIL_SEND_FAILED')
    }

    await prisma.emailLog.create({
      data: {
        ...baseLogData,
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId ?? null,
      },
    })

    return { sent: true, status: 'SENT', to: effectiveTo }
  },

  async sendManualEntityEmail(input: SendManualEntityEmailInput): Promise<SendEmailResult> {
    if (input.entityType !== 'AccountingDocument') {
      throw new AppError(
        501,
        `Envío manual no implementado todavía para la entidad ${input.entityType}`,
        'NOT_IMPLEMENTED',
      )
    }

    const templateData = input.templateData as unknown as ManualDocumentEmailData
    const built = buildManualDocumentSendEmail({ ...templateData, message: input.message })
    const subject = input.subjectOverride?.trim() || built.subject

    return this.sendEmail({
      type: 'MANUAL_DOCUMENT_SEND',
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      html: built.html,
      replyTo: input.actor.email,
      attachments: input.attachments,
      entityType: input.entityType,
      entityId: input.entityId,
      actor: input.actor,
    })
  },

  // ── Roadmap (fuera de alcance en esta fase) ──────────────────────────────────
  // sendExpirationSummaryEmail: migrar notifications.service.ts para que arme
  //   su HTML con email.templates.ts y pase por acá (hoy sigue usando Nodemailer
  //   directo, intacto a propósito).
  // sendWorkflowNotification: notificaciones internas a responsables por rol
  //   (auditorías pendientes, documentos observados, pólizas por aprobar).
  // Ninguno de los dos tiene todavía consumidores — se declaran acá para que
  // la forma del servicio no cambie cuando se implementen.
  async sendExpirationSummaryEmail(): Promise<never> {
    throw new AppError(501, 'No implementado en esta fase', 'NOT_IMPLEMENTED')
  },

  async sendWorkflowNotification(): Promise<never> {
    throw new AppError(501, 'No implementado en esta fase', 'NOT_IMPLEMENTED')
  },
}
