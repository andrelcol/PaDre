import { Outlet } from 'react-router'

import { SiteHeader } from '@/domains/identity/components/site-header.tsx'

export function AppShell() {
  return (
    <div className="min-h-svh">
      <SiteHeader />
      <Outlet />
    </div>
  )
}
