import { Suspense } from 'react'
import { Outlet } from 'react-router'

import { SiteHeader } from '@/domains/identity/components/site-header.tsx'
import { BackendStatus } from '@/shared/platform/backend-status.tsx'
import { NativeBridge } from '@/shared/platform/native-bridge.tsx'

export function AppShell() {
  return (
    <div className="min-h-svh md:pl-64">
      <NativeBridge />
      <SiteHeader />
      <BackendStatus />
      <div className="pb-[var(--padre-overlay-bottom)] md:pb-8">
        <Suspense
          fallback={
            <p
              role="status"
              className="px-6 py-10 text-sm text-muted-foreground"
            >
              Carregando
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
