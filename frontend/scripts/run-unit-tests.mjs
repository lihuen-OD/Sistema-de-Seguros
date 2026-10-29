// Compila tests/unit/*.test.ts con el esbuild existente y los ejecuta con el
// runner nativo de Node. Los paquetes quedan externos para admitir módulos
// nativos como jsdom sin intentar incluirlos en el bundle.
import { build } from 'esbuild'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(root, 'tests/unit')
const entries = readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(testDir, f))
if (entries.length === 0) {
  console.error('No hay tests en tests/unit')
  process.exit(1)
}

const outdir = mkdtempSync(path.join(root, '.frontend-unit-'))
try {
  await build({
    entryPoints: entries,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node20',
    define: { 'import.meta.env': '{}' },
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
