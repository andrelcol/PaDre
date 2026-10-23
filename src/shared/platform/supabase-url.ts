const localHosts = new Set(['127.0.0.1', 'localhost'])

export function resolveSupabaseUrl(
  configured: string,
  options: { android: boolean; androidUrl?: string },
) {
  if (!options.android) return configured
  if (options.androidUrl) return options.androidUrl.replace(/\/$/, '')

  const url = new URL(configured)
  if (localHosts.has(url.hostname)) url.hostname = '10.0.2.2'
  return url.toString().replace(/\/$/, '')
}

export function publicWebOrigin(options: {
  android: boolean
  configured?: string
  locationOrigin: string
}) {
  if (options.android && options.configured) {
    return options.configured.replace(/\/$/, '')
  }
  return options.locationOrigin
}
