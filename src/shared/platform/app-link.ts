const inviteToken = /^[A-Za-z0-9_-]{43}$/
const meetupId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const communitySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function appPathFromUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:' &&
    url.protocol !== 'padre:'
  ) {
    return null
  }

  if (url.protocol !== 'padre:' && !trustedHttpHost(url.hostname)) return null

  const path =
    url.protocol === 'padre:'
      ? `/${url.hostname}${url.pathname}`.replace(/\/{2,}/g, '/')
      : url.pathname

  return acceptedPath(path)
}

function trustedHttpHost(hostname: string) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  const configured = import.meta.env.VITE_APP_LINK_HOST
  return typeof configured === 'string' && configured === hostname
}

function acceptedPath(path: string) {
  if (path === '/redefinir-senha') return path

  const invite = path.match(/^\/convite\/([^/]+)$/)
  if (invite?.[1] && inviteToken.test(invite[1])) return path

  const meetup = path.match(/^\/encontros\/([^/]+)$/)
  if (meetup?.[1] && meetupId.test(meetup[1])) return path

  const community = path.match(/^\/comunidades\/([^/]+)$/)
  if (
    community?.[1] &&
    community[1].length <= 48 &&
    communitySlug.test(community[1])
  ) {
    return path
  }

  return null
}
