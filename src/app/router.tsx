import { createBrowserRouter } from 'react-router'

import { AppShell } from '@/app/AppShell.tsx'
import { lazyPage } from '@/app/lazy-page.ts'
import { RouteError } from '@/app/route-error.tsx'
import {
  GuestOnly,
  RequireAuth,
} from '@/domains/identity/components/guards.tsx'

function page(load: () => Promise<Record<string, unknown>>, name: string) {
  return lazyPage(load, name)
}

const CatalogPage = page(() => import('@/pages/CatalogPage.tsx'), 'CatalogPage')
const CommunitiesPage = page(
  () => import('@/pages/CommunitiesPage.tsx'),
  'CommunitiesPage',
)
const CommunityPage = page(
  () => import('@/pages/CommunityPage.tsx'),
  'CommunityPage',
)
const FriendsPage = page(() => import('@/pages/FriendsPage.tsx'), 'FriendsPage')
const NewCommunityPage = page(
  () => import('@/pages/NewCommunityPage.tsx'),
  'NewCommunityPage',
)
const MeetupPage = page(() => import('@/pages/MeetupPage.tsx'), 'MeetupPage')
const MeetupsPage = page(() => import('@/pages/MeetupsPage.tsx'), 'MeetupsPage')
const NewMeetupPage = page(
  () => import('@/pages/NewMeetupPage.tsx'),
  'NewMeetupPage',
)
const EditProfilePage = page(
  () => import('@/pages/EditProfilePage.tsx'),
  'EditProfilePage',
)
const HomePage = page(() => import('@/pages/HomePage.tsx'), 'HomePage')
const InvitePage = page(() => import('@/pages/InvitePage.tsx'), 'InvitePage')
const LoginPage = page(() => import('@/pages/LoginPage.tsx'), 'LoginPage')
const ProfilePage = page(() => import('@/pages/ProfilePage.tsx'), 'ProfilePage')
const RecoverPasswordPage = page(
  () => import('@/pages/RecoverPasswordPage.tsx'),
  'RecoverPasswordPage',
)
const ResetPasswordPage = page(
  () => import('@/pages/ResetPasswordPage.tsx'),
  'ResetPasswordPage',
)
const SignupPage = page(() => import('@/pages/SignupPage.tsx'), 'SignupPage')
const VenuesPage = page(() => import('@/pages/VenuesPage.tsx'), 'VenuesPage')

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/convite/:token', element: <InvitePage /> },
      { path: '/modalidades', element: <CatalogPage /> },
      { path: '/comunidades', element: <CommunitiesPage /> },
      {
        path: '/comunidades/nova',
        element: (
          <RequireAuth>
            <NewCommunityPage />
          </RequireAuth>
        ),
      },
      { path: '/comunidades/:slug', element: <CommunityPage /> },
      {
        path: '/encontros',
        element: (
          <RequireAuth>
            <MeetupsPage />
          </RequireAuth>
        ),
      },
      {
        path: '/encontros/novo',
        element: (
          <RequireAuth>
            <NewMeetupPage />
          </RequireAuth>
        ),
      },
      {
        path: '/encontros/:id',
        element: (
          <RequireAuth>
            <MeetupPage />
          </RequireAuth>
        ),
      },
      {
        path: '/locais',
        element: (
          <RequireAuth>
            <VenuesPage />
          </RequireAuth>
        ),
      },
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
