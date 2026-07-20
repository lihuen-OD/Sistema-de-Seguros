import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      // El código ya usa `any` puntualmente en tipos genéricos/Prisma —
      // marcarlo como warning (visibilidad) en vez de error (no bloquear el
      // build por algo que hoy es una práctica aceptada en el proyecto).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      // `declare global { namespace Express { ... } }` es el patrón estándar
      // de TypeScript para augmentar tipos de una librería externa (acá,
      // Request.user) — no es el uso de namespace-como-organización que la
      // regla busca evitar.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
)
