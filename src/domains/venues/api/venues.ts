import {
  parseVenue,
  parseVenueMeetups,
  parseVenues,
  type VenueDraft,
  type VenueEdit,
} from '@/domains/venues/model/venue.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function listMyVenues() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_my_venues')
  if (error) throw error
  return parseVenues(data)
}

export async function listCommunityVenues(slug: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_community_venues', { slug })
  if (error) throw error
  return parseVenues(data)
}

export async function listVenueMeetups(
  venueId: string,
  limit: number,
  offset: number,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_venue_meetups', {
    venue_id: venueId,
    result_limit: limit,
    result_offset: offset,
  })
  if (error) throw error
  return parseVenueMeetups(data)
}

export async function createVenue(draft: VenueDraft, communitySlug?: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_venue', {
    name: draft.name,
    address: draft.address,
    details: draft.details || null,
    latitude: draft.latitude,
    longitude: draft.longitude,
    community_slug: communitySlug ?? null,
  })
  if (error) throw error
  return parseVenue(data)
}

export async function updateVenue(venueId: string, draft: VenueEdit) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('update_venue', {
    venue_id: venueId,
    name: draft.name,
    details: draft.details || null,
  })
  if (error) throw error
  return parseVenue(data)
}

export async function setVenueLocation(
  venueId: string,
  latitude: number,
  longitude: number,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('set_venue_location', {
    venue_id: venueId,
    latitude,
    longitude,
  })
  if (error) throw error
  return parseVenue(data)
}

export async function archiveVenue(venueId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('archive_venue', {
    venue_id: venueId,
  })
  if (error) throw error
  return parseVenue(data)
}
