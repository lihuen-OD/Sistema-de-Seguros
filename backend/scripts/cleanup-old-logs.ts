// Borra filas viejas de las 4 tablas de log/auditoría con ventana de
// retención definida (ver CLAUDE.md §6) — el resto de las tablas "de log"
// del schema (AssetStatusHistory, ExchangeRateLog, ClaimEvent, AuditComment)
// quedaron deliberadamente afuera: son datos de negocio de bajo volumen con
// valor patrimonial/legal de largo plazo, no ruido técnico.
//
// Uso:
//   cd backend
//   DATABASE_URL="<url del ambiente>" npx ts-node -r dotenv/config scripts/cleanup-old-logs.ts [--dry-run]
//
// --dry-run: solo cuenta y muestra cuántas filas borraría de cada tabla, sin
// ejecutar ningún DELETE. Correr siempre así primero contra un ambiente antes
// de correrlo de verdad.
//
// (si no se pasa DATABASE_URL explícito, usa el que tenga cargado backend/.env)

import { prisma } from '../src/config/database'

const RETENTION = [
  { label: 'EmailLog', months: 6, deleteMany: (cutoff: Date) => prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } }), count: (cutoff: Date) => prisma.emailLog.count({ where: { createdAt: { lt: cutoff } } }) },
  { label: 'DocumentAuditLog', months: 60, deleteMany: (cutoff: Date) => prisma.documentAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }), count: (cutoff: Date) => prisma.documentAuditLog.count({ where: { createdAt: { lt: cutoff } } }) },
  { label: 'FireExtinguisherHistory', months: 36, deleteMany: (cutoff: Date) => prisma.fireExtinguisherHistory.deleteMany({ where: { createdAt: { lt: cutoff } } }), count: (cutoff: Date) => prisma.fireExtinguisherHistory.count({ where: { createdAt: { lt: cutoff } } }) },
  { label: 'UserAuditLog', months: 24, deleteMany: (cutoff: Date) => prisma.userAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }), count: (cutoff: Date) => prisma.userAuditLog.count({ where: { createdAt: { lt: cutoff } } }) },
]

function cutoffDate(months: number): Date {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  return d
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  console.log(dryRun ? 'Modo --dry-run: no se borra nada, solo se cuenta.\n' : 'Modo real: se van a borrar filas.\n')

  for (const { label, months, deleteMany, count } of RETENTION) {
    const cutoff = cutoffDate(months)
    if (dryRun) {
      const n = await count(cutoff)
      console.log(`${label}: ${n} fila(s) más viejas que ${cutoff.toISOString().slice(0, 10)} (${months} meses) se borrarían.`)
    } else {
      const { count: n } = await deleteMany(cutoff)
      console.log(`${label}: ${n} fila(s) más viejas que ${cutoff.toISOString().slice(0, 10)} (${months} meses) borradas.`)
    }
  }

  await prisma.$disconnect()
}

main()
