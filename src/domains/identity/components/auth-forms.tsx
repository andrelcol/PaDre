import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'

import { TextField } from '@/domains/identity/components/fields.tsx'
import { Button } from '@/shared/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card.tsx'

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <section className="rounded-3xl bg-ink px-6 py-8 text-ink-foreground">
        <p className="text-sm font-semibold text-pitch">PaDre — Sports Club</p>
        <h1 className="mt-3 text-4xl font-bold">{title}</h1>
        <p className="mt-3 max-w-md text-lg">{description}</p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sua conta</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  )
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

function readForm(form: HTMLFormElement) {
  const data = new FormData(form)
  return {
    email: String(data.get('email') ?? ''),
    password: String(data.get('password') ?? ''),
    username: String(data.get('username') ?? ''),
    displayName: String(data.get('displayName') ?? ''),
  }
}

export function LoginForm({
  onSubmit,
  pending,
  formError,
  fieldErrors,
}: {
  onSubmit: (values: { email: string; password: string }) => void
  pending: boolean
  formError?: string
  fieldErrors: Record<string, string>
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = readForm(event.currentTarget)
    onSubmit({ email: values.email, password: values.password })
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <TextField
        id="email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <TextField
        id="password"
        name="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        error={fieldErrors.password}
      />
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link className="underline" to="/recuperar-senha">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  )
}

export function SignupForm({
  onSubmit,
  pending,
  formError,
  fieldErrors,
}: {
  onSubmit: (values: {
    email: string
    password: string
    username: string
    displayName: string
  }) => void
  pending: boolean
  formError?: string
  fieldErrors: Record<string, string>
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(readForm(event.currentTarget))
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <TextField
        id="display-name"
        name="displayName"
        label="Nome"
        autoComplete="name"
        error={fieldErrors.displayName}
      />
      <TextField
        id="username"
        name="username"
        label="Nome de usuário"
        autoComplete="username"
        error={fieldErrors.username}
      />
      <TextField
        id="email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <TextField
        id="password"
        name="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Criando conta…' : 'Criar conta'}
      </Button>
    </form>
  )
}

export function RecoverForm({
  onSubmit,
  pending,
  formError,
  fieldErrors,
  success,
}: {
  onSubmit: (values: { email: string }) => void
  pending: boolean
  formError?: string
  fieldErrors: Record<string, string>
  success: boolean
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ email: readForm(event.currentTarget).email })
  }

  if (success) {
    return (
      <p role="status" className="text-sm">
        Se existir uma conta com esse e-mail, enviamos um link para redefinir a
        senha. Abra o link neste mesmo navegador.
      </p>
    )
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <TextField
        id="email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        error={fieldErrors.email}
      />
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Enviando…' : 'Enviar link'}
      </Button>
    </form>
  )
}

export function ResetForm({
  onSubmit,
  pending,
  formError,
  fieldErrors,
}: {
  onSubmit: (values: { password: string }) => void
  pending: boolean
  formError?: string
  fieldErrors: Record<string, string>
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ password: readForm(event.currentTarget).password })
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <TextField
        id="password"
        name="password"
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        error={fieldErrors.password}
      />
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Salvando…' : 'Salvar senha'}
      </Button>
    </form>
  )
}
