import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

import { assessHostedClientEnv } from './src/shared/platform/hosted-env.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  if (mode === 'beta') {
    const problems = assessHostedClientEnv(hostedEnv(mode))
    if (problems.length > 0) {
      throw new Error(`Build beta recusada.\n${problems.join('\n')}`)
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }
})

function hostedEnv(mode: string) {
  const fromFiles = loadEnv(mode, rootDir, 'VITE_')
  const value = (key: string) => process.env[key] || fromFiles[key] || undefined

  return {
    appEnv: value('VITE_APP_ENV'),
    supabaseUrl: value('VITE_SUPABASE_URL'),
    anonKey: value('VITE_SUPABASE_ANON_KEY'),
    publicWebOrigin: value('VITE_PUBLIC_WEB_ORIGIN'),
    androidUrl: value('VITE_SUPABASE_URL_ANDROID'),
    appLinkHost: value('VITE_APP_LINK_HOST'),
  }
}
