import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/app/AppShell.tsx'
import {
  GuestOnly,
  RequireAuth,
} from '@/domains/identity/components/guards.tsx'
import { CatalogPage } from '@/pages/CatalogPage.tsx'
import { FriendsPage } from '@/pages/FriendsPage.tsx'
import { EditProfilePage } from '@/pages/EditProfilePage.tsx'
import { HomePage } from '@/pages/HomePage.tsx'
import { LoginPage } from '@/pages/LoginPage.tsx'
import { ProfilePage } from '@/pages/ProfilePage.tsx'
import { RecoverPasswordPage } from '@/pages/RecoverPasswordPage.tsx'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage.tsx'
import { SignupPage } from '@/pages/SignupPage.tsx'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/modalidades', element: <CatalogPage /> },
      {
        path: '/amigos',
        element: (
          <RequireAuth>
            <FriendsPage />
          </RequireAuth>
        ),
      },
      {
        path: '/entrar',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: '/cadastrar',
        element: (
          <GuestOnly>
            <SignupPage />
          </GuestOnly>
        ),
      },
      {
        path: '/recuperar-senha',
        element: (
          <GuestOnly>
            <RecoverPasswordPage />
          </GuestOnly>
        ),
      },
      { path: '/redefinir-senha', element: <ResetPasswordPage /> },
      {
        path: '/perfil',
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      {
        path: '/perfil/editar',
        element: (
          <RequireAuth>
            <EditProfilePage />
          </RequireAuth>
        ),
      },
    ],
  },
])
