import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'

import { resetPassword } from '@/domains/identity/api/auth.ts'
import {
  AuthCard,
  ResetForm,
} from '@/domains/identity/components/auth-forms.tsx'
import { useSession } from '@/domains/identity/components/session.tsx'
import {
  fieldErrorsFromZod,
  resetSchema,
} from '@/domains/identity/model/profile.ts'

export function ResetPasswordPage() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      void navigate('/perfil')
    },
  })

  if (loading) {
    return (
      <p
        className="px-6 py-16 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Carregando sessão
      </p>
    )
  }

  if (!session) {
    return (
      <AuthCard
        title="Redefinir senha"
        description="O link precisa ser aberto no mesmo navegador em que foi pedido."
      >
        <p className="text-sm">
          Este link não está mais válido.{' '}
          <Link className="underline" to="/recuperar-senha">
            Pedir outro
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Redefinir senha"
      description="Escolha uma senha nova para a sua conta."
    >
      <ResetForm
        pending={mutation.isPending}
        formError={
          mutation.error instanceof Error ? mutation.error.message : undefined
        }
        fieldErrors={fieldErrors}
        onSubmit={(values) => {
          const parsed = resetSchema.safeParse(values)
          if (!parsed.success) {
            setFieldErrors(fieldErrorsFromZod(parsed.error))
            return
          }
          setFieldErrors({})
          mutation.mutate(parsed.data)
        }}
      />
    </AuthCard>
  )
}
