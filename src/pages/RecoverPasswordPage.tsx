import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { requestPasswordRecovery } from '@/domains/identity/api/auth.ts'
import {
  AuthCard,
  RecoverForm,
} from '@/domains/identity/components/auth-forms.tsx'
import {
  fieldErrorsFromZod,
  recoverSchema,
} from '@/domains/identity/model/profile.ts'

export function RecoverPasswordPage() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState(false)
  const mutation = useMutation({
    mutationFn: requestPasswordRecovery,
    onSuccess: () => {
      setSuccess(true)
    },
  })

  return (
    <AuthCard
      title="Recuperar senha"
      description="Enviaremos um link para escolher outra senha."
    >
      <RecoverForm
        pending={mutation.isPending}
        success={success}
        formError={
          mutation.error instanceof Error ? mutation.error.message : undefined
        }
        fieldErrors={fieldErrors}
        onSubmit={(values) => {
          const parsed = recoverSchema.safeParse(values)
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
