import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const reactHooksConfig = reactHooks.configs.flat.recommended

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
      '.tools',
      'supabase/.runtime',
      'supabase/.temp',
      'android',
      'artifacts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooksConfig,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      'scripts/**/*.mjs',
      'vite.config.ts',
      'vitest.db.config.ts',
      'playwright.config.ts',
      'supabase/tests/**/*.ts',
      'e2e/**/*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
)
