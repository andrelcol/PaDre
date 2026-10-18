export function toAuthError(error: { message: string; code?: string }) {
  const message = error.message.toLowerCase()

  if (
    message.includes('invalid login') ||
    message.includes('invalid credentials')
  ) {
    return new Error('E-mail ou senha incorretos.')
  }

  if (
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return new Error('Já existe uma conta com esse e-mail.')
  }

  if (
    message.includes('invalid username') ||
    message.includes('username') ||
    error.code === '23505'
  ) {
    return new Error('Esse nome de usuário não está disponível.')
  }

  if (message.includes('password')) {
    return new Error('A senha precisa ter pelo menos 8 caracteres.')
  }

  if (message.includes('time zone') || message.includes('timezone')) {
    return new Error('Escolha um fuso IANA válido.')
  }

  return new Error('Não foi possível concluir. Tente de novo.')
}
