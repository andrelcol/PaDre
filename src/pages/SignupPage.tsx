import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { signUp } from '@/domains/identity/api/auth.ts'
import { readPublicWebOrigin } from '@/shared/lib/env.ts'
import {
  inviteAuthPath,
  inviteEmailRedirect,
  inviteReturnPath,
} from '@/domains/meetups/model/invite-link.ts'
import {
  AuthCard,
  SignupForm,
} from '@/domains/identity/components/auth-forms.tsx'
import {
  fieldErrorsFromZod,
  signupSchema,
} from '@/domains/identity/model/profile.ts'

export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const retorno = inviteReturnPath(params.get('retorno'))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof signUp>[0]) =>
      signUp(input, inviteEmailRedirect(readPublicWebOrigin(), retorno)),
    onSuccess: (result) => {
      if (result.session) {
        void navigate(retorno ?? '/perfil')
        return
      }
      setNeedsConfirmation(true)
    },
  })

  return (
    <AuthCard
      title="Criar conta"
      description="O perfil nasce privado. Você escolhe o que fica público depois."
    >
      {retorno ? (
        <>
          <meta name="referrer" content="no-referrer" />
          <meta name="robots" content="noindex, nofollow" />
        </>
      ) : null}
      {needsConfirmation ? (
        <p role="status" className="text-sm">
          Conta criada. Confirme o e-mail antes de entrar.
          {retorno
            ? ' Abra de novo o convite depois de confirmar. A presença só entra quando você confirmar nela.'
            : ''}{' '}
          {retorno ? (
            <Link className="underline" to={retorno}>
              Voltar ao convite
            </Link>
          ) : null}{' '}
          <Link className="underline" to={inviteAuthPath('/entrar', retorno)}>
            Ir para o login
          </Link>
        </p>
      ) : (
        <SignupForm
          pending={mutation.isPending}
          formError={
            mutation.error instanceof Error ? mutation.error.message : undefined
          }
          fieldErrors={fieldErrors}
          onSubmit={(values) => {
            const parsed = signupSchema.safeParse(values)
            if (!parsed.success) {
              setFieldErrors(fieldErrorsFromZod(parsed.error))
              return
            }
            setFieldErrors({})
            mutation.mutate(parsed.data)
          }}
        />
      )}
    </AuthCard>
  )
}
