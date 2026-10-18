import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { signIn } from '@/domains/identity/api/auth.ts'
import {
  inviteAuthPath,
  inviteReturnPath,
} from '@/domains/meetups/model/invite-link.ts'
import {
  AuthCard,
  LoginForm,
} from '@/domains/identity/components/auth-forms.tsx'
import {
  fieldErrorsFromZod,
  loginSchema,
} from '@/domains/identity/model/profile.ts'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const retorno = inviteReturnPath(params.get('retorno'))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: () => {
      void navigate(retorno ?? '/perfil')
    },
  })

  return (
    <AuthCard title="Entrar" description="Use o e-mail e a senha da sua conta.">
      {retorno ? (
        <>
          <meta name="referrer" content="no-referrer" />
          <meta name="robots" content="noindex, nofollow" />
        </>
      ) : null}
      <LoginForm
        pending={mutation.isPending}
        formError={
          mutation.error instanceof Error ? mutation.error.message : undefined
        }
        fieldErrors={fieldErrors}
        onSubmit={(values) => {
          const parsed = loginSchema.safeParse(values)
          if (!parsed.success) {
            setFieldErrors(fieldErrorsFromZod(parsed.error))
            return
          }
          setFieldErrors({})
          mutation.mutate(parsed.data)
        }}
      />
      {retorno ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link
            className="underline"
            to={inviteAuthPath('/cadastrar', retorno)}
          >
            Criar conta
          </Link>
        </p>
      ) : null}
    </AuthCard>
  )
}
