import {
  parseCommunityPoll,
  parseCommunityPolls,
  type PollKind,
  type PollWrite,
  type SelectionMode,
} from '@/domains/polls/model/poll.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function listCommunityPolls(
  slug: string,
  status: 'open' | 'closed' | 'cancelled',
  pageLimit: number,
  beforeCreatedAt: string | null,
  beforeId: string | null,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_community_polls', {
    slug,
    status,
    page_limit: pageLimit,
    before_created_at: beforeCreatedAt,
    before_id: beforeId,
  })
  if (error) throw error
  return parseCommunityPolls(data)
}

export async function createCommunityPoll(input: {
  slug: string
  draft: PollWrite
}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_community_poll', {
    slug: input.slug,
    question: input.draft.question,
    description: input.draft.description,
    kind: input.draft.kind satisfies PollKind,
    selection_mode: input.draft.selectionMode satisfies SelectionMode,
    max_selections: input.draft.maxSelections,
    closes_at: input.draft.closesAt,
    options: input.draft.options,
  })
  if (error) throw error
  return parseCommunityPoll(data)
}

export async function voteCommunityPoll(pollId: string, optionIds: string[]) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('vote_community_poll', {
    poll_id: pollId,
    option_ids: optionIds,
  })
  if (error) throw error
  return parseCommunityPoll(data)
}

export async function closeCommunityPoll(pollId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('close_community_poll', {
    poll_id: pollId,
  })
  if (error) throw error
  return parseCommunityPoll(data)
}

export async function cancelCommunityPoll(pollId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('cancel_community_poll', {
    poll_id: pollId,
  })
  if (error) throw error
  return parseCommunityPoll(data)
}
