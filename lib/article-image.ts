type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function decodeUrlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
}

export function normalizeImageUrl(value: unknown, baseUrl?: string | null): string | null {
  if (typeof value !== 'string') return null
  const candidate = decodeUrlEntities(value.trim())
  if (!candidate || candidate.length > 4096) return null

  try {
    const url = candidate.startsWith('//')
      ? new URL(`https:${candidate}`)
      : new URL(candidate, baseUrl ?? undefined)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

export function extractHtmlImage(html: unknown, baseUrl?: string | null): string | null {
  if (typeof html !== 'string' || !html) return null
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = [...tag[0].matchAll(/(?:data-src|data-original|data-lazy-src|src)\s*=\s*["']([^"']+)["']/gi)]
    for (const match of attributes) {
      const imageUrl = normalizeImageUrl(match[1], baseUrl)
      if (imageUrl) return imageUrl
    }
  }
  return null
}

function extractMediaUrl(value: unknown, baseUrl?: string | null): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const imageUrl = extractMediaUrl(entry, baseUrl)
      if (imageUrl) return imageUrl
    }
    return null
  }

  const directUrl = normalizeImageUrl(value, baseUrl)
  if (directUrl) return directUrl
  const record = asRecord(value)
  if (!record) return null

  for (const key of ['url', 'href', 'src']) {
    const imageUrl = normalizeImageUrl(record[key], baseUrl)
    if (imageUrl) return imageUrl
  }
  return extractMediaUrl(record.$, baseUrl)
}

function mediaAttribute(record: UnknownRecord, key: string): unknown {
  return record[key] ?? asRecord(record.$)?.[key]
}

function isVideoUrl(value: unknown, baseUrl?: string | null): boolean {
  const url = normalizeImageUrl(value, baseUrl)
  return Boolean(url && /\.(?:m3u8|m4v|mov|mp4|webm)(?:$|[?#])/i.test(url))
}

function isVideoMedia(value: unknown, baseUrl?: string | null): boolean {
  if (Array.isArray(value)) return value.some((entry) => isVideoMedia(entry, baseUrl))
  if (isVideoUrl(value, baseUrl)) return true

  const record = asRecord(value)
  if (!record) return false
  const type = String(mediaAttribute(record, 'type') ?? '').toLowerCase()
  const medium = String(mediaAttribute(record, 'medium') ?? '').toLowerCase()
  return type.startsWith('video/')
    || medium === 'video'
    || ['url', 'href', 'src'].some((key) => isVideoUrl(mediaAttribute(record, key), baseUrl))
}

function extractNestedThumbnail(value: unknown, baseUrl?: string | null): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const thumbnail = extractNestedThumbnail(entry, baseUrl)
      if (thumbnail) return thumbnail
    }
    return null
  }

  const record = asRecord(value)
  if (!record) return null
  for (const key of ['mediaThumbnail', 'media:thumbnail', 'thumbnail']) {
    const thumbnail = extractMediaUrl(record[key], baseUrl)
    if (thumbnail) return thumbnail
  }
  return null
}

function extractMediaImage(value: unknown, baseUrl?: string | null): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const imageUrl = extractMediaImage(entry, baseUrl)
      if (imageUrl) return imageUrl
    }
    return null
  }

  const record = asRecord(value)
  if (!record) return null
  const nestedThumbnail = extractNestedThumbnail(record, baseUrl)
  if (nestedThumbnail) return nestedThumbnail

  const type = String(mediaAttribute(record, 'type') ?? '').toLowerCase()
  const medium = String(mediaAttribute(record, 'medium') ?? '').toLowerCase()
  if (isVideoMedia(record, baseUrl) || (type && !type.startsWith('image/')) || (medium && medium !== 'image')) {
    return null
  }
  return extractMediaUrl(record, baseUrl)
}

function extractHtmlVideoPoster(html: unknown, baseUrl?: string | null): string | null {
  if (typeof html !== 'string' || !html) return null
  for (const tag of html.matchAll(/<video\b[^>]*>/gi)) {
    const poster = tag[0].match(/poster\s*=\s*["']([^"']+)["']/i)?.[1]
    const imageUrl = normalizeImageUrl(poster, baseUrl)
    if (imageUrl) return imageUrl
  }
  return null
}

function containsEmbeddedVideo(html: unknown): boolean {
  if (typeof html !== 'string' || !html) return false
  return /<video\b/i.test(html)
    || /<iframe\b[^>]+(?:youtube\.com|youtu\.be|vimeo\.com|bilibili\.com|douyin\.com|youku\.com)/i.test(html)
}

export type FeedMedia = {
  imageUrl: string | null
  isVideo: boolean
}

export function extractFeedMedia(item: unknown, feedUrl?: string | null): FeedMedia {
  const record = asRecord(item)
  if (!record) return { imageUrl: null, isVideo: false }
  const baseUrl = typeof record.link === 'string' ? record.link : feedUrl
  let imageUrl: string | null = null
  let isVideo = false

  const enclosure = asRecord(record.enclosure)
  const enclosureType = typeof enclosure?.type === 'string' ? enclosure.type.toLowerCase() : ''
  if (enclosure) {
    isVideo = isVideoMedia(enclosure, baseUrl)
    if (!isVideo && (!enclosureType || enclosureType.startsWith('image/'))) {
      imageUrl = normalizeImageUrl(enclosure.url, baseUrl)
    }
  }

  for (const field of ['mediaThumbnail', 'media:thumbnail']) {
    imageUrl ??= extractMediaImage(record[field], baseUrl)
  }
  for (const field of ['mediaContent', 'media:content']) {
    isVideo ||= isVideoMedia(record[field], baseUrl)
    imageUrl ??= extractMediaImage(record[field], baseUrl)
  }

  for (const field of ['contentEncoded', 'content:encoded', 'content', 'summary', 'description']) {
    isVideo ||= containsEmbeddedVideo(record[field])
    imageUrl ??= extractHtmlVideoPoster(record[field], baseUrl)
    imageUrl ??= extractHtmlImage(record[field], baseUrl)
  }
  return { imageUrl, isVideo }
}

export function extractFeedImage(item: unknown, feedUrl?: string | null): string | null {
  return extractFeedMedia(item, feedUrl).imageUrl
}
