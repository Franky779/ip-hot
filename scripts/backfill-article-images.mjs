import pg from 'pg'
import Parser from 'rss-parser'

const { Pool } = pg
const apply = process.argv.includes('--apply')
const daysArg = process.argv.find((arg) => arg.startsWith('--days='))
const requestedDays = Number.parseInt(daysArg?.slice('--days='.length) ?? '30', 10)
const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 30
const concurrency = 6
const maxItemsPerFeed = 50

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing')
}

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
})

function normalizeUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const candidate = value.trim().replace(/&amp;/gi, '&')
    const url = candidate.startsWith('//') ? new URL(`https:${candidate}`) : new URL(candidate, baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.protocol === 'http:') url.protocol = 'https:'
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function mediaUrl(value, baseUrl) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = mediaUrl(entry, baseUrl)
      if (url) return url
    }
    return null
  }
  const direct = normalizeUrl(value, baseUrl)
  if (direct) return direct
  if (!value || typeof value !== 'object') return null
  return normalizeUrl(value.url ?? value.href ?? value.src, baseUrl) || mediaUrl(value.$, baseUrl)
}

function mediaAttribute(value, key) {
  if (!value || typeof value !== 'object') return null
  return value[key] ?? value.$?.[key] ?? null
}

function isVideoUrl(value, baseUrl) {
  const url = normalizeUrl(value, baseUrl)
  return Boolean(url && /\.(?:m3u8|m4v|mov|mp4|webm)(?:$|[?#])/i.test(url))
}

function isVideoMedia(value, baseUrl) {
  if (Array.isArray(value)) return value.some((entry) => isVideoMedia(entry, baseUrl))
  if (isVideoUrl(value, baseUrl)) return true
  if (!value || typeof value !== 'object') return false
  const type = String(mediaAttribute(value, 'type') ?? '').toLowerCase()
  const medium = String(mediaAttribute(value, 'medium') ?? '').toLowerCase()
  return type.startsWith('video/')
    || medium === 'video'
    || ['url', 'href', 'src'].some((key) => isVideoUrl(mediaAttribute(value, key), baseUrl))
}

function nestedThumbnail(value, baseUrl) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = nestedThumbnail(entry, baseUrl)
      if (url) return url
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  return mediaUrl(value.mediaThumbnail ?? value['media:thumbnail'] ?? value.thumbnail, baseUrl)
}

function mediaImage(value, baseUrl) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = mediaImage(entry, baseUrl)
      if (url) return url
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const thumbnail = nestedThumbnail(value, baseUrl)
  if (thumbnail) return thumbnail
  const type = String(mediaAttribute(value, 'type') ?? '').toLowerCase()
  const medium = String(mediaAttribute(value, 'medium') ?? '').toLowerCase()
  if (isVideoMedia(value, baseUrl) || (type && !type.startsWith('image/')) || (medium && medium !== 'image')) {
    return null
  }
  return mediaUrl(value, baseUrl)
}

function htmlImage(value, baseUrl) {
  if (typeof value !== 'string') return null
  for (const tag of value.matchAll(/<img\b[^>]*>/gi)) {
    for (const match of tag[0].matchAll(/(?:data-src|data-original|data-lazy-src|src)\s*=\s*["']([^"']+)["']/gi)) {
      const url = normalizeUrl(match[1], baseUrl)
      if (url) return url
    }
  }
  return null
}

function feedMedia(item, feedUrl) {
  const baseUrl = item.link || feedUrl
  let imageUrl = null
  let isVideo = false
  const enclosureType = String(item.enclosure?.type ?? '').toLowerCase()
  if (item.enclosure) {
    isVideo = isVideoMedia(item.enclosure, baseUrl)
    if (!isVideo && (!enclosureType || enclosureType.startsWith('image/'))) {
      imageUrl = normalizeUrl(item.enclosure.url, baseUrl)
    }
  }
  for (const field of ['mediaThumbnail', 'media:thumbnail']) {
    imageUrl ||= mediaImage(item[field], baseUrl)
  }
  for (const field of ['mediaContent', 'media:content']) {
    isVideo ||= isVideoMedia(item[field], baseUrl)
    imageUrl ||= mediaImage(item[field], baseUrl)
  }
  for (const field of ['contentEncoded', 'content:encoded', 'content', 'summary', 'description']) {
    const html = item[field]
    if (typeof html === 'string') {
      isVideo ||= /<video\b/i.test(html)
        || /<iframe\b[^>]+(?:youtube\.com|youtu\.be|vimeo\.com|bilibili\.com|douyin\.com|youku\.com)/i.test(html)
      const poster = html.match(/<video\b[^>]*\bposter\s*=\s*["']([^"']+)["']/i)?.[1]
      imageUrl ||= normalizeUrl(poster, baseUrl)
    }
    imageUrl ||= htmlImage(html, baseUrl)
  }
  return { imageUrl, isVideo }
}

function articleKey(source, value) {
  const url = normalizeUrl(value)
  if (!url) return null
  if (url.endsWith('/')) return `${source}\u0000${url.slice(0, -1)}`
  return `${source}\u0000${url}`
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

try {
  const [sourceResult, articleResult] = await Promise.all([
    pool.query(`
      select name, url
      from info_sources
      where enabled = true and fetch_type = 'rss'
      order by sort_order, name
    `),
    pool.query(`
      select id, source, url, image_url, is_video
      from articles
      where (image_url is null or is_video = false)
        and created_at >= now() - ($1::integer * interval '1 day')
    `, [days]),
  ])

  const pendingByKey = new Map()
  for (const article of articleResult.rows) {
    const key = articleKey(article.source, article.url)
    if (key) pendingByKey.set(key, article)
  }

  const matches = new Map()
  const failures = []
  let cursor = 0
  async function worker() {
    while (cursor < sourceResult.rows.length) {
      const source = sourceResult.rows[cursor++]
      try {
        const response = await fetch(source.url, {
          headers: {
            'user-agent': 'Mozilla/5.0 IP-HOT image backfill',
            accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const feed = await parser.parseString(await response.text())
        for (const item of feed.items.slice(0, maxItemsPerFeed)) {
          const key = articleKey(source.name, item.link)
          const article = key ? pendingByKey.get(key) : null
          if (!article) continue
          const media = feedMedia(item, source.url)
          if ((!article.image_url && media.imageUrl) || (!article.is_video && media.isVideo)) {
            matches.set(article.id, media)
          }
        }
      } catch (error) {
        failures.push({ source: source.name, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  let updated = 0
  if (apply && matches.size > 0) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      for (const [id, media] of matches) {
        const result = await client.query(
          'update articles set image_url = coalesce(image_url, $1), is_video = is_video or $2 where id = $3',
          [media.imageUrl, media.isVideo, id],
        )
        updated += result.rowCount ?? 0
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    days,
    rssSources: sourceResult.rows.length,
    candidateArticles: articleResult.rows.length,
    matchedImages: [...matches.values()].filter((media) => media.imageUrl).length,
    matchedVideos: [...matches.values()].filter((media) => media.isVideo).length,
    updated,
    failedSources: failures.length,
    failureSamples: failures.slice(0, 10),
  }, null, 2))
  if (!apply) console.log('Dry run only. Add --apply after reviewing these counts.')
} finally {
  await pool.end()
}
