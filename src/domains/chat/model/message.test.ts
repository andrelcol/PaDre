import { describe, expect, it } from 'vitest'

import {
  mergeCommunityMessages,
  messageFromChatError,
  parseCommunityMessages,
} from './message.ts'

describe('community messages', () => {
  it('parses a page and keeps chronological merges without duplicates', () => {
    const page = parseCommunityMessages({
      has_older: true,
      messages: [
        {
          id: 'a1000000-0000-4000-8000-000000000002',
          author_username: 'bia',
          body: 'segunda',
          created_at: '2026-10-19T12:01:00.000Z',
          deleted: false,
          mine: false,
          can_moderate: false,
          meetup: null,
        },
      ],
    })
    const older = parseCommunityMessages({
      has_older: false,
      messages: [
        {
          id: 'a1000000-0000-4000-8000-000000000001',
          author_username: 'ana',
          body: 'primeira',
          created_at: '2026-10-19T12:00:00.000Z',
          deleted: false,
          mine: true,
          can_moderate: false,
          meetup: null,
        },
      ],
    })
    const merged = mergeCommunityMessages([
      ...older.messages,
      ...page.messages,
      page.messages[0]!,
    ])
    expect(merged.map((message) => message.body)).toEqual([
      'primeira',
      'segunda',
    ])
    expect(messageFromChatError({ message: 'too many messages' })).toMatch(
      /mensagens demais/,
    )
  })
})
