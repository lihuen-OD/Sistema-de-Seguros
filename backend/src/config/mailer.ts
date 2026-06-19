import nodemailer from 'nodemailer'
import { env } from './env'

export function isMailerConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
}

let _transporter: nodemailer.Transporter | null = null

export function getTransporter(): nodemailer.Transporter {
  if (!isMailerConfigured()) {
    throw new Error('SMTP no configurado. Definí SMTP_HOST, SMTP_USER y SMTP_PASS en .env')
  }
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }
  return _transporter
}
