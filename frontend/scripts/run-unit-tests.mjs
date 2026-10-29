// Tests unitarios del frontend SIN dependencias nuevas (R4-B): empaqueta cada
// tests/unit/*.test.ts con el esbuild que ya trae Vite y los corre con el
// runner nativo de Node (node:test). Solo para lógica pura (helpers y
// cálculos) — no hay DOM ni React acá. Si se aprueba agregar vitest, estos
// mismos tests migran casi sin cambios.
import { build } from 'esbuild'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(root, 'tests/unit')
const entries = readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(testDir, f))
if (entries.length === 0) {
  console.error('No hay tests en tests/unit')
  process.exit(1)
}

const outdir = mkdtempSync(path.join(tmpdir(), 'frontend-unit-'))
try {
  await build({
    entryPoints: entries,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outdir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'warning',
  })
  const outputs = entries.map((entry) => path.join(outdir, path.basename(entry).replace(/\.ts$/, '.mjs')))
  const result = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  rmSync(outdir, { recursive: true, force: true })
}
