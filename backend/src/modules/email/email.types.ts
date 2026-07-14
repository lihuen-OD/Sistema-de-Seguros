// Tipos de la capa central de email. La DB modela `type`/`status` como String
// libre (ver convención en schema.prisma — sin enums de Prisma), pero acá se
// tipan como union de TS para tener autocompletado y chequeo en el código.

export type EmailType =
  | 'MANUAL_DOCUMENT_SEND'
  | 'EXPIRATION_SUMMARY'
  | 'ATTACHMENT_EXPIRATION'
  | 'POLICY_EXPIRATION'
  | 'FIRE_EXTINGUISHER_EXPIRATION'
  | 'WORKFLOW_NOTIFICATION'
  | 'SYSTEM'

export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELLED'

export interface EmailActor {
  userId: string
  email: string
}

export interface EmailAttachment {
  filename: string
  content: Buffer
}

// Payload ya resuelto (from/replyTo definidos) que recibe el provider — nunca
// expone detalles internos del SDK de cada proveedor.
export interface NormalizedEmailPayload {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

export interface EmailProviderSendResult {
  success: boolean
  providerMessageId?: string
  errorMessage?: string
}

// Entrada genérica de EmailService.sendEmail — todavía sin from/replyTo
// resueltos, eso lo hace el service según el `type`.
export interface SendEmailInput {
  type: EmailType
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  replyTo?: string
  attachments?: EmailAttachment[]
  entityType?: string
  entityId?: string
  actor?: EmailActor
  metadata?: Record<string, unknown>
}

export interface SendEmailResult {
  sent: boolean
  status: EmailStatus
  to: string[]
  errorMessage?: string
}

export interface SendManualEntityEmailInput {
  entityType: string
  entityId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subjectOverride?: string
  message?: string
  templateData: Record<string, unknown>
  attachments?: EmailAttachment[]
  actor: EmailActor
}
