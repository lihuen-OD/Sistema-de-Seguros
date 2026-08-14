// Detecta pólizas afectadas por el bug histórico de la migración
// 20260730120000_add_policy_asset_coverage: al convertir Policy.assetIds[] a
// PolicyAssetCoverage, copió el monto COMPLETO de la póliza a CADA activo en
// vez de repartirlo — así que una póliza con 2+ activos puede tener el mismo
// insuredAmount duplicado en todas sus líneas, inflando la suma asegurada
// real al sumarlas.
//
// Es SOLO LECTURA — no modifica ningún dato. Sirve para correr contra demo o
// producción (con el DATABASE_URL de ese ambiente) y confirmar si el mismo
// problema existe ahí, antes de corregir nada a mano con los montos reales.
//
// Uso:
//   cd backend
//   DATABASE_URL="<url de demo o producción>" npx ts-node -r dotenv/config scripts/detect-coverage-split-bug.ts
//
// (si no se pasa DATABASE_URL explícito, usa el que tenga cargado backend/.env)

import { prisma } from '../src/config/database'

async function main() {
  const rows = await prisma.policyAssetCoverage.findMany({
    select: {
      id: true,
      policyId: true,
      insuredAmount: true,
      currency: true,
      insuredAmountArs: true,
      insuredAmountUsd: true,
      createdAt: true,
      updatedAt: true,
      policy: { select: { policyNumber: true, insuredName: true, createdAt: true, isActive: true } },
      asset: { select: { name: true, code: true } },
    },
    orderBy: [{ policyId: 'asc' }, { createdAt: 'asc' }],
  })

  const byPolicy = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byPolicy.get(r.policyId) ?? []
    list.push(r)
    byPolicy.set(r.policyId, list)
  }

  const multiAsset = [...byPolicy.entries()].filter(([, lines]) => lines.length > 1)
  const suspicious = multiAsset.filter(([, lines]) => {
    const amounts = new Set(lines.map((l) => l.insuredAmount))
    const neverTouched = lines.every((l) => l.createdAt.getTime() === l.updatedAt.getTime())
    return amounts.size === 1 && lines[0].insuredAmount > 0 && neverTouched
  })

  console.log(`Pólizas con más de un activo: ${multiAsset.length}`)
  console.log(`Sospechosas (mismo monto en todas las líneas, nunca editadas desde que se crearon): ${suspicious.length}\n`)

  if (suspicious.length === 0) {
    console.log('No se encontraron pólizas con la firma del bug en este ambiente.')
  }

  for (const [, lines] of suspicious) {
    const p = lines[0].policy
    console.log(`Póliza ${p.policyNumber} — ${p.insuredName} (creada ${p.createdAt.toISOString().slice(0, 10)}, ${p.isActive ? 'activa' : 'inactiva'})`)
    for (const l of lines) {
      console.log(`  - ${l.asset?.name ?? l.asset?.code ?? '(sin activo)'}: ${l.insuredAmount} ${l.currency} (ARS=${l.insuredAmountArs}, USD=${l.insuredAmountUsd})`)
    }
    console.log('')
  }

  // Multi-activo pero NO sospechosas: para que quede claro qué se descartó y por qué,
  // no solo lo que se marcó como afectado.
  const notSuspicious = multiAsset.filter(([policyId]) => !suspicious.some(([sid]) => sid === policyId))
  if (notSuspicious.length > 0) {
    console.log(`\n${notSuspicious.length} póliza(s) multi-activo descartadas (montos ya distintos entre líneas, o ya editadas a mano desde que se crearon):`)
    for (const [, lines] of notSuspicious) {
      console.log(`  - ${lines[0].policy.policyNumber}`)
    }
  }

  await prisma.$disconnect()
}

main()
