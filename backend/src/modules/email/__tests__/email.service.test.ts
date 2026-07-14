jest.mock('../../../config/database', () => ({
  prisma: {
    emailLog: { create: jest.fn() },
  },
}))

jest.mock('../../../config/env', () => ({
  env: {
    EMAIL_ENABLED: false,
    EMAIL_PROVIDER: 'resend',
    EMAIL_FROM_DEFAULT: 'Sistema Seguros <default@losodwyer.com>',
    EMAIL_FROM_NOTIFICATIONS: 'Sistema Seguros <notificaciones@losodwyer.com>',
    EMAIL_FROM_MANUAL: 'Sistema Seguros <seguros@losodwyer.com>',
    EMAIL_FORCE_TO: undefined,
    EMAIL_LOG_BODY: false,
    RESEND_API_KEY: 'test-key',
    FRONTEND_URL: 'http://localhost:5173',
  },
}))

const mockSend = jest.fn()
jest.mock('../resend.provider', () => ({
  ResendEmailProvider: jest.fn().mockImplementation(() => ({ send: mockSend })),
}))

import { prisma } from '../../../config/database'
import { env } from '../../../config/env'
import { emailService } from '../email.service'
import type { SendEmailInput } from '../email.types'

const db = prisma as any

const baseInput: SendEmailInput = {
  type: 'MANUAL_DOCUMENT_SEND',
  to: ['destinatario@empresa.com'],
  subject: 'Asunto de prueba',
  html: '<p>Hola</p>',
  replyTo: 'vendedor@losodwyer.com',
  entityType: 'AccountingDocument',
  entityId: 'doc-1',
  actor: { userId: 'user-1', email: 'vendedor@losodwyer.com' },
}

describe('emailService.sendEmail', () => {
  beforeEach(() => {
    ;(env as any).EMAIL_ENABLED = false
    ;(env as any).EMAIL_FORCE_TO = undefined
    db.emailLog.create.mockResolvedValue({})
  })

  it('no llama al provider y registra SKIPPED cuando EMAIL_ENABLED=false', async () => {
    const result = await emailService.sendEmail(baseInput)

    expect(result).toEqual({ sent: false, status: 'SKIPPED', to: baseInput.to })
    expect(mockSend).not.toHaveBeenCalled()
    expect(db.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    )
  })

  it('envía y registra SENT cuando el provider responde éxito', async () => {
    ;(env as any).EMAIL_ENABLED = true
    mockSend.mockResolvedValue({ success: true, providerMessageId: 'msg-123' })

    const result = await emailService.sendEmail(baseInput)

    expect(result).toEqual({ sent: true, status: 'SENT', to: baseInput.to })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: baseInput.to,
        from: 'Sistema Seguros <seguros@losodwyer.com>',
        replyTo: baseInput.replyTo,
      }),
    )
    expect(db.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', providerMessageId: 'msg-123' }),
      }),
    )
  })

  it('registra FAILED y lanza un error genérico sin exponer el detalle crudo del provider', async () => {
    ;(env as any).EMAIL_ENABLED = true
    mockSend.mockResolvedValue({ success: false, errorMessage: 'Resend rechazó la API key: sk_live_abc123' })

    await expect(emailService.sendEmail(baseInput)).rejects.toMatchObject({
      statusCode: 502,
      code: 'EMAIL_SEND_FAILED',
    })

    expect(db.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Resend rechazó la API key: sk_live_abc123',
        }),
      }),
    )
  })

  it('redirige a EMAIL_FORCE_TO y guarda el destinatario original en metadata', async () => {
    ;(env as any).EMAIL_ENABLED = true
    ;(env as any).EMAIL_FORCE_TO = 'qa@losodwyer.com'
    mockSend.mockResolvedValue({ success: true, providerMessageId: 'msg-456' })

    const result = await emailService.sendEmail(baseInput)

    expect(result.to).toEqual(['qa@losodwyer.com'])
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: ['qa@losodwyer.com'] }))
    expect(db.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toAddresses: ['qa@losodwyer.com'],
          metadata: expect.objectContaining({ originalTo: baseInput.to }),
        }),
      }),
    )
  })

  it('sanitiza saltos de línea en subject/replyTo para evitar header injection', async () => {
    ;(env as any).EMAIL_ENABLED = true
    mockSend.mockResolvedValue({ success: true, providerMessageId: 'msg-789' })

    await emailService.sendEmail({
      ...baseInput,
      subject: 'Asunto\r\nBcc: atacante@evil.com',
      replyTo: 'legit@empresa.com\nX-Injected: true',
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Asunto Bcc: atacante@evil.com',
        replyTo: 'legit@empresa.com X-Injected: true',
      }),
    )
  })
})
