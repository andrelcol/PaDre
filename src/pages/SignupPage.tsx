import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import { signUp } from '@/domains/identity/api/auth.ts'
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const mutation = useMutation({
    mutationFn: signUp,
    onSuccess: (result) => {
      if (result.session) {
        void navigate('/perfil')
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
      {needsConfirmation ? (
        <p role="status" className="text-sm">
          Conta criada. Confirme o e-mail antes de entrar.{' '}
          <Link className="underline" to="/entrar">
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
