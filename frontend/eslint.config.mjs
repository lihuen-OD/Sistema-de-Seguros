import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // El código usa `any` puntualmente para props de tablas/columnas
      // genéricas y datos de terceros (recharts, xlsx/exceljs) — warning en
      // vez de error, no bloquear el build por algo ya aceptado hoy.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Regla nueva de eslint-plugin-react-hooks v7: marca como error el
      // patrón "cargó el registro → sincronizar el form" (useEffect + setState),
      // usado en casi todas las páginas de edición de este proyecto. Es un
      // patrón válido en React (no un bug), solo una preferencia arquitectónica
      // más nueva — se deja en warning en vez de error para no forzar reescribir
      // todos los formularios de edición como efecto secundario de sumar ESLint.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  prettierConfig,
)
