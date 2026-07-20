import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findSourceConfiguration } from '../lib/sources.ts'

const shouldApply = process.argv.includes('--apply')
const shouldMergeDuplicates = process.argv.includes('--merge-duplicates')
const LOCAL_CDP_URLS = new Set([
  'licenseglobal.com/latest-news',
  'ctoy.com.cn/n/c3990', 'ctoy.com.cn/n/c3993', 'ctoy.com.cn/n/c3991',
  'ctoy.com.cn/n/c4009', 'ctoy.com.cn/n/c3992', 'ctoy.com.cn/n/c4053',
  'wjyt-china.org', 'ccdy.cn', 'zjol.com.cn', 'shxwcb.com', 'ycwb.com',
  'ynet.com', 'cdsb.com', 'wglt.dg.gov.cn', 'whly.tj.gov.cn', 'hzxh.gov.cn',
  'sea.ign.com/anime', 'crunchyroll.com/news/latest', 'animeanime.jp/category/news',
  'famitsu.com/category/news/page/1',
])

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {}
  return Object.fromEntries(readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) return []
    return [[match[1], match[2].replace(/^['"]|['"]$/g, '')]]
  }))
}

function parseMethod(method) {
  try {
    const parsed = JSON.parse(method || '')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase()
  }
}

function scheduleFor(source) {
  const current = parseMethod(source.method)
  const configured = findSourceConfiguration(source.url, source.name)
  const configuredMode = current.execution_mode
    || (configured?.needsLocalCdp || current.needs_local_cdp === true ? 'local' : configured?.loginRequired || current.login_required === true ? 'manual' : source.enabled ? 'cloud' : 'paused')
  const executionMode = configuredMode === 'local' && !LOCAL_CDP_URLS.has(normalizeUrl(source.url))
    ? 'manual'
    : configuredMode
  const tier = current.schedule_tier
    || (configured?.type === 'gov' || configured?.priority === 'P2' ? 'weekly' : configured?.priority === 'P0' ? 'daily' : 'every_2_days')
  return { current, executionMode, tier }
}

function canonicalFirst(left, right) {
  const score = (source) => (source.enabled ? 4 : 0) + (source.last_test_status === 'success' ? 2 : 0) + (source.last_test_status === 'untested' ? 1 : 0)
  return score(right) - score(left)
    || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    || left.id.localeCompare(right.id)
}

const env = { ...loadEnv(resolve(process.cwd(), '.env.local')), ...process.env }
const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || env.NEXTPUBLICSUPABASEURL || '').replace(/\/$/, '')
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASESECRETKEY

if (!supabaseUrl || !serviceKey) throw new Error('缺少 Supabase 服务端配置，请在项目根目录执行。')

const baseHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
const response = await fetch(`${supabaseUrl}/rest/v1/info_sources?select=*`, { headers: baseHeaders })
if (!response.ok) throw new Error(`读取信息源失败：HTTP ${response.status}`)
const sources = await response.json()
const groups = new Map()
for (const source of sources) {
  const key = normalizeUrl(source.url)
  groups.set(key, [...(groups.get(key) || []), source])
}

const duplicateOf = new Map()
if (shouldMergeDuplicates) {
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [canonical, ...duplicates] = [...group].sort(canonicalFirst)
    for (const duplicate of duplicates) duplicateOf.set(duplicate.id, canonical)
  }
}

const updates = sources.map((source) => {
  const { current, executionMode, tier } = scheduleFor(source)
  const canonical = duplicateOf.get(source.id)
  return {
    id: source.id,
    name: source.name,
    duplicate: canonical?.name || null,
    current,
    executionMode: canonical ? 'paused' : executionMode,
    tier,
    canonical,
  }
})

const intervals = { daily: 4, every_2_days: 8, weekly: 28 }
for (const tier of Object.keys(intervals)) {
  const tierUpdates = updates
    .filter((item) => item.executionMode === 'cloud' && item.tier === tier)
    .sort((left, right) => left.id.localeCompare(right.id))
  tierUpdates.forEach((item, index) => {
    item.slot = index % intervals[tier]
  })
}

for (const update of updates) {
  const nextMethod = {
    ...update.current,
    execution_mode: update.executionMode,
    schedule_tier: update.tier,
    scheduler_version: 1,
    ...(typeof update.slot === 'number' ? { schedule_slot: update.slot } : {}),
    ...(update.canonical ? { duplicate_of: update.canonical.id } : {}),
  }
  update.body = {
    method: JSON.stringify(nextMethod),
    ...(update.canonical ? {
      enabled: false,
      last_test_message: `已合并为主信息源：${update.canonical.name}（保留记录，可恢复）`,
    } : {}),
  }
}

console.log(`信息源：${sources.length} 条；重复网址组：${[...groups.values()].filter((group) => group.length > 1).length}；将停用副本：${duplicateOf.size} 条。`)
console.log(updates.filter((item) => item.duplicate).map((item) => `- ${item.name} → ${item.duplicate}`).join('\n') || '没有需要合并的副本。')

if (!shouldApply) {
  console.log('仅完成预检。确认后执行：node --experimental-strip-types scripts/normalize-source-schedules.mjs --apply --merge-duplicates')
  process.exit(0)
}

for (const update of updates) {
  const updateResponse = await fetch(`${supabaseUrl}/rest/v1/info_sources?id=eq.${encodeURIComponent(update.id)}`, {
    method: 'PATCH',
    headers: { ...baseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(update.body),
  })
  if (!updateResponse.ok) throw new Error(`更新 ${update.name} 失败：HTTP ${updateResponse.status}`)
}

console.log(`已更新 ${updates.length} 条信息源配置。`)
