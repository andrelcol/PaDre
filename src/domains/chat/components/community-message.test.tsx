import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { CommunityMessage } from '@/domains/chat/model/message.ts'

import { CommunityMessageRow } from './community-message.tsx'

const message: CommunityMessage = {
  id: 'a1000000-0000-4000-8000-000000000099',
  authorUsername: 'ana',
  body: '<img src=x onerror=alert(1)><script>alert(1)</script>',
  createdAt: '2026-10-19T12:00:00.000Z',
  deleted: false,
  mine: false,
  canModerate: false,
  meetup: null,
}

describe('CommunityMessageRow', () => {
  it('renders member text without executing markup', () => {
    const { container } = render(
      <MemoryRouter>
        <CommunityMessageRow
          message={message}
          pending={false}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(message.body)).toBeVisible()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })
})
