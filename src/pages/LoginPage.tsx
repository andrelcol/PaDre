import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { signIn } from '@/domains/identity/api/auth.ts'
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: () => {
      void navigate('/perfil')
    },
  })

  return (
    <AuthCard title="Entrar" description="Use o e-mail e a senha da sua conta.">
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
    </AuthCard>
  )
}
