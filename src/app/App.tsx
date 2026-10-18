import { RouterProvider } from 'react-router'
import { AppProviders } from './providers.tsx'
import { router } from './router.tsx'

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
