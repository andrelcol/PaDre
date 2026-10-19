import { parseCommunityMessages } from '@/domains/chat/model/message.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function listCommunityMessages(
  slug: string,
  beforeCreatedAt: string | null,
  beforeId: string | null,
  pageLimit = 50,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_community_messages', {
    slug,
    before_created_at: beforeCreatedAt,
    before_id: beforeId,
    page_limit: pageLimit,
  })
  if (error) throw error
  return parseCommunityMessages(data)
}

export async function sendCommunityMessage(input: {
  slug: string
  body: string
  meetupId: string | null
  clientRequestId: string
}) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('send_community_message', {
    slug: input.slug,
    body: input.body,
    meetup_id: input.meetupId,
    client_request_id: input.clientRequestId,
  })
  if (error) throw error
  const message = parseCommunityMessages({
    has_older: false,
    messages: [data],
  }).messages[0]
  if (!message) throw new Error('Não foi possível enviar a mensagem.')
  return message
}

export async function deleteCommunityMessage(messageId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('delete_community_message', {
    message_id: messageId,
  })
  if (error) throw error
}
