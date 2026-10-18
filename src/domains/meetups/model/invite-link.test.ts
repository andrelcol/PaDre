import { describe, expect, it } from 'vitest'

import {
  inviteAuthPath,
  inviteEmailRedirect,
  inviteReturnPath,
  inviteShareUrl,
  parseInvitePreview,
} from './invite-link.ts'

const token = 'a'.repeat(43)
const path = `/convite/${token}`

describe('invite links', () => {
  it('accepts only an internal invite path', () => {
    expect(inviteReturnPath(path)).toBe(path)
    expect(inviteReturnPath('https://evil.test/convite/' + token)).toBeNull()
    expect(inviteReturnPath('//evil.test')).toBeNull()
    expect(inviteReturnPath('/convite/curto')).toBeNull()
    expect(inviteReturnPath(`${path}/extra`)).toBeNull()
    expect(inviteReturnPath(`${path}?next=https://evil.test`)).toBeNull()
    expect(inviteReturnPath('/perfil')).toBeNull()
    expect(inviteReturnPath(null)).toBeNull()
  })

  it('builds auth links and a same-origin email redirect', () => {
    expect(inviteAuthPath('/entrar', path)).toBe(
      `/entrar?retorno=${encodeURIComponent(path)}`,
    )
    expect(inviteAuthPath('/cadastrar', 'https://evil.test')).toBe('/cadastrar')
    expect(inviteEmailRedirect('http://127.0.0.1:5173', path)).toBe(
      `http://127.0.0.1:5173${path}`,
    )
    expect(
      inviteEmailRedirect('http://127.0.0.1:5173', '/perfil'),
    ).toBeUndefined()
    expect(inviteShareUrl('http://127.0.0.1:5173', token)).toBe(
      `http://127.0.0.1:5173${path}`,
    )
    expect(inviteShareUrl('http://127.0.0.1:5173', 'curto')).toBeNull()
  })

  it('rejects a preview that carries a private address', () => {
    expect(
      parseInvitePreview({
        status: 'open',
        title: 'Vôlei',
        sport_name: 'Vôlei',
        format_name: 'Vôlei 6x6',
        starts_at: '2099-01-01T22:00:00.000Z',
        ends_at: '2099-01-02T00:00:00.000Z',
        time_zone: 'America/Sao_Paulo',
        location_name: 'Quadra',
        open_spots: 1,
        participation: null,
        meetup_id: null,
        location_address: 'Rua secreta',
      }),
    ).not.toHaveProperty('location_address')
    expect(parseInvitePreview({ status: 'unavailable' })).toEqual({
      status: 'unavailable',
    })
  })
})
