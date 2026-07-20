import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { findSourceConfiguration, RSS_SOURCES, NEW_SOURCE_NAMES, type ScrapeConfig } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'
import { checkLinks } from '@/lib/link-checker'
import { getSourceSchedule, isCloudSourceDue, type SourceScheduleTier } from '@/lib/source-schedule'
import { execFileSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 300

const parser = new Parser({ timeout: 15000 })

type RuntimeSource = {
  id: string
  name: string
  url: string
  fetchType: 'rss' | 'web'
  scheduleTier: SourceScheduleTier
  scrapeConfig?: ScrapeConfig
  qualityMode: 'normal' | 'observe' | 'reduced' | 'paused'
}

async function loadActiveSources(supabase: ReturnType<typeof createServiceClient>): Promise<RuntimeSource[]> {
  const { data, error } = await supabase
    .from('info_sources')
    .select('id, name, url, fetch_type, method, type, sort_order')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })

  if (!error) {
    const { data: actionRows } = await supabase
      .from('cron_logs')
      .select('details')
      .eq('trigger_type', 'source_quality_action')
      .order('started_at', { ascending: false })
      .limit(500)
    const qualityModes = new Map<string, RuntimeSource['qualityMode']>()
    for (const row of actionRows ?? []) {
      const details = row.details as { sourceId?: unknown; mode?: unknown } | null
      if (typeof details?.sourceId !== 'string' || qualityModes.has(details.sourceId)) continue
      if (details.mode === 'normal' || details.mode === 'observe' || details.mode === 'reduced' || details.mode === 'paused') {
        qualityModes.set(details.sourceId, details.mode)
      }
    }
    return (data ?? []).flatMap((source): RuntimeSource[] => {
      const configuredSource = findSourceConfiguration(source.url, source.name)
      const schedule = getSourceSchedule({
        id: source.id,
        name: source.name,
        url: source.url,
        method: source.method,
        type: source.type,
        enabled: true,
        priority: configuredSource?.priority,
        needsLocalCdp: configuredSource?.needsLocalCdp,
        loginRequired: configuredSource?.loginRequired,
      })
      if (schedule.executionMode !== 'cloud' || !isCloudSourceDue({
        id: source.id,
        name: source.name,
        url: source.url,
        method: source.method,
        type: source.type,
        enabled: true,
        priority: configuredSource?.priority,
        needsLocalCdp: configuredSource?.needsLocalCdp,
        loginRequired: configuredSource?.loginRequired,
      })) {
        return []
      }
      const fetchType = configuredSource
        ? configuredSource.type === 'rss' || configuredSource.isRss ? 'rss' : 'web'
        : source.fetch_type === 'rss' ? 'rss' : 'web'
      return [{
        id: source.id,
        name: source.name,
        url: configuredSource?.url || source.url,
        fetchType,
        scheduleTier: schedule.tier,
        qualityMode: qualityModes.get(source.id) ?? 'normal',
        scrapeConfig: configuredSource?.scrapeConfig || (
          fetchType === 'web' ? { adapter: 'auto-news-links', maxItems: 10 } : undefined
        ),
      }]
    })
  }

  // 数据库迁移执行前保持现有任务可用，避免部署过程停止抓取。
  console.warn('[Sources] 数据库运行字段尚不可用，暂用代码内 RSS 清单:', error.message)
  return RSS_SOURCES.filter((source) => source.type === 'rss').map(({ id, name, url }) => ({
    id,
    name,
    url,
    fetchType: 'rss',
    scheduleTier: 'every_2_days',
    qualityMode: 'normal',
  }))
}

async function fetchFeedWithFallback(url: string): Promise<Parser.Output<{
  [key: string]: any
}> | null> {
  // 1. 先用普通 fetch 尝试
  try {
    const feed = await parseFeedUrl(url)
    return feed
  } catch {
    // 2. 失败后用 Scrapling fallback（反检测 Chromium）
    const tmpFile = join(tmpdir(), `rss-${Date.now()}.xml`)
    const pythonExe = process.env.SCRAPLING_PYTHON || 'D:\\claudecode\\.venv-scrapling\\Scripts\\python.exe'
    const scriptPath = join(process.cwd(), 'scripts', 'fetch-rss-scrapling.py')
    try {
      execFileSync(pythonExe, [scriptPath, url, tmpFile], {
        timeout: 35000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const xml = readFileSync(tmpFile, 'utf-8')
      unlinkSync(tmpFile)
      const feed = await parser.parseString(xml)
      return feed
    } catch {
      return null
    }
  }
}

const BLOCK_PATTERNS: RegExp[] = [
  /\bto star (as|in)\b/i,
  /\bcast as\b/i,
  /\bstars? in\b/i,
  /\bjoins?\s+(the\s+)?(cast|film|movie|series)\b/i,
  /\b(manga|anime|movie|film|book|series) review\b/i,
  /^review[:\s]/i,
  /^retrospective[:\s]/i,
]

function isNoise(title: string): boolean {
  return BLOCK_PATTERNS.some((p) => p.test(title))
}

type FetchResult = {
  source: string
  ok: boolean
  discovered: number
  fetched: number
  blocked: number
  dead: number
  duplicates: number
  inserted: number
  error?: string
}

type ProcessResult = {
  id: string
  source: string
  title: string
  url: string
  ok: boolean
  score: number | null
  selected: boolean
  commentary: string
  status: 'scored' | 'failed' | 'unscored'
  error?: string
}

export async function GET(request: Request) {
  // 支持两种验证方式：Vercel Cron (Bearer CRON_SECRET) 或 管理员手动触发 (x-admin-password)
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  const adminPw = request.headers.get('x-admin-password')
  const isCronAuth = process.env.CRON_SECRET && authHeader === expectedAuth
  const isAdminAuth = adminPw === process.env.ADMIN_PASSWORD

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startTime = Date.now()
  const triggerType = isAdminAuth ? 'manual' : 'cron'
  let logId: string | null = null

  try {
    // 创建日志记录
    const { data: logData, error: logError } = await supabase
      .from('cron_logs')
      .insert({
        trigger_type: triggerType,
        status: 'running',
        fetch_total_fetched: 0,
        fetch_total_inserted: 0,
        llm_pending: 0,
        llm_processed: 0,
        llm_failed: 0,
      })
      .select('id')
      .single()

    logId = logData?.id ?? null
    if (logError) {
      console.error('[CronLog] 创建日志失败:', logError.message)
    }

    // ===== 第1步：抓取 RSS =====
  const updateRunningLog = async (updates: Record<string, unknown>) => {
    if (!logId) return
    const { error } = await supabase
      .from('cron_logs')
      .update({ status: 'running', ...updates })
      .eq('id', logId)
    if (error) {
      console.error('[CronLog] 更新运行进度失败:', error.message)
    }
  }

  const fetchResults: FetchResult[] = []
  let totalInserted = 0

  const activeSources = await loadActiveSources(supabase)
  const batchSize = 24
  const eligibleSources = activeSources.filter((source) =>
    source.qualityMode !== 'reduced' || Math.floor(Date.now() / 86_400_000) % 2 === 0
  )
  const scheduledSources = eligibleSources
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, batchSize)
  const updateFetchProgress = async (currentSource: string) => {
    await updateRunningLog({
      fetch_total_fetched: fetchResults.reduce((sum, item) => sum + item.fetched, 0),
      fetch_total_inserted: totalInserted,
      details: {
        stage: 'fetch',
        currentSource,
        sourcesCompleted: fetchResults.length,
        totalSources: scheduledSources.length,
      },
    })
  }

  for (const source of scheduledSources) {
    const result: FetchResult = { source: source.name, ok: false, discovered: 0, fetched: 0, blocked: 0, dead: 0, duplicates: 0, inserted: 0 }

    try {
      const { data: currentSource, error: currentSourceError } = await supabase
        .from('info_sources')
        .select('id')
        .eq('id', source.id)
        .eq('enabled', true)
        .maybeSingle()
      if (currentSourceError || !currentSource) {
        result.error = 'Source was disabled or deleted before fetching'
        fetchResults.push(result)
        await updateFetchProgress(source.name)
        continue
      }

      let rawItems: Array<{
        source: string
        url: string
        title: string
        published_at: string | null
      }>

      if (source.fetchType === 'rss') {
        const feed = await fetchFeedWithFallback(source.url)
        if (!feed) {
          result.error = 'RSS fetch failed (including Scrapling fallback)'
          fetchResults.push(result)
          await updateFetchProgress(source.name)
          continue
        }
        rawItems = feed.items
          .map((item) => ({
            source: source.name,
            url: item.link ?? '',
            title: item.title ?? '',
            published_at: item.isoDate ?? null,
          }))
          .filter((item) => item.url.length > 0 && item.title.length > 0)
      } else {
        if (!source.scrapeConfig) {
          result.error = 'Web source is missing scrapeConfig'
          fetchResults.push(result)
          await updateFetchProgress(source.name)
          continue
        }
        const scraped = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
        if (scraped.error) {
          result.error = scraped.error
          fetchResults.push(result)
          await updateFetchProgress(source.name)
          continue
        }
        rawItems = scraped.items.map((item) => ({
          source: source.name,
          url: item.url,
          title: item.title,
          published_at: item.publishedAt,
        }))
      }

      const items = rawItems.filter((x) => !isNoise(x.title))
      result.discovered = rawItems.length
      result.fetched = items.length
      result.blocked = rawItems.length - items.length

      // 链接有效性预检
      let validItems = items
      if (items.length > 0) {
        const linkChecks = await checkLinks(
          items.map((x) => x.url),
          5,
          6000
        )
        const validUrls = new Set(linkChecks.filter((r) => r.ok).map((r) => r.url))
        validItems = items.filter((x) => validUrls.has(x.url))
        result.dead = items.length - validItems.length

        const deadLinks = linkChecks.filter((r) => !r.ok)
        if (deadLinks.length > 0) {
          console.log(`  [链接检查] 过滤 ${deadLinks.length} 条失效链接:`)
          deadLinks.forEach((d) => console.log(`    - ${d.url} (${d.reason})`))
        }
      }

      if (validItems.length > 0) {
        const { data, error } = await supabase
          .from('articles')
          .upsert(validItems, { onConflict: 'source,url', ignoreDuplicates: true })
          .select('id')

        if (error) {
          result.error = `Supabase: ${error.message}`
        } else {
          result.ok = true
          result.inserted = data?.length ?? 0
          result.duplicates = Math.max(0, validItems.length - result.inserted)
          totalInserted += result.inserted
        }
      } else {
        result.ok = true
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }

    fetchResults.push(result)
    await updateFetchProgress(source.name)
  }

  // ===== 第2步：对新文章跑 LLM =====
  // max_tokens=3000 后每条LLM约40-60秒，4条约40-60秒，控制在60秒超时内
  const LLM_BATCH_SIZE = 8

  const { data: pendingArticles, error: pendingError } = await supabase
    .from('articles')
    .select('id, title, url, source, published_at')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(LLM_BATCH_SIZE)

  let processResults: ProcessResult[] = []
  let processedCount = 0
  let llmCompletedCount = 0
  let llmProgressUpdate = Promise.resolve()

  await updateRunningLog({
    fetch_total_fetched: fetchResults.reduce((sum, item) => sum + item.fetched, 0),
    fetch_total_inserted: totalInserted,
    llm_pending: pendingArticles?.length ?? 0,
    details: {
      stage: 'llm',
      llmCompleted: 0,
      llmTotal: pendingArticles?.length ?? 0,
    },
  })

  if (!pendingError && pendingArticles && pendingArticles.length > 0) {
    processResults = await Promise.all(
      pendingArticles.map(async (article): Promise<ProcessResult> => {
        let resultOk = false
        try {
          const llmResult = await summarizeArticle(article.title, '')

          if (!llmResult) {
            // LLM 失败降级
            const { error: updateError } = await supabase
              .from('articles')
              .update({
                title_cn: article.title.slice(0, 60),
                summary_cn: '',
                category: null,
                relevance_score: null,
                is_selected: false,
                commentary: null,
              })
              .eq('id', article.id)
            resultOk = !updateError
            return {
              id: article.id, source: article.source, title: article.title, url: article.url,
              ok: !updateError, score: null, selected: false, commentary: '',
              status: updateError ? 'failed' : 'unscored', error: updateError?.message,
            }
          }

          // 新增信源的文章强制归类为"待分类"，等人工审核
          const isNewSource = NEW_SOURCE_NAMES.has(article.source)
          const finalCategory = isNewSource ? '待分类' : llmResult.category
          const finalIsSelected = isNewSource ? false : llmResult.is_selected

          const { error: updateError } = await supabase
            .from('articles')
            .update({
              title_cn: llmResult.title_cn,
              summary_cn: llmResult.summary_cn,
              category: finalCategory,
              relevance_score: llmResult.relevance_score,
              is_selected: finalIsSelected,
              commentary: llmResult.commentary,
            })
            .eq('id', article.id)

          resultOk = !updateError
          return {
            id: article.id, source: article.source, title: article.title, url: article.url,
            ok: !updateError,
            score: updateError ? null : llmResult.relevance_score,
            selected: updateError ? false : finalIsSelected,
            commentary: updateError ? '' : llmResult.commentary,
            status: updateError ? 'failed' : 'scored',
            error: updateError?.message,
          }
        } catch (e) {
          return {
            id: article.id, source: article.source, title: article.title, url: article.url,
            ok: false, score: null, selected: false, commentary: '', status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          }
        } finally {
          llmCompletedCount += 1
          if (resultOk) processedCount += 1
          const completed = llmCompletedCount
          const processed = processedCount
          llmProgressUpdate = llmProgressUpdate.then(() => updateRunningLog({
            llm_pending: pendingArticles.length,
            llm_processed: processed,
            llm_failed: completed - processed,
            details: {
              stage: 'llm',
              llmCompleted: completed,
              llmTotal: pendingArticles.length,
            },
          }))
          await llmProgressUpdate
        }
      })
    )
    processedCount = processResults.filter((r) => r.ok).length
  }

  const elapsed = Date.now() - startTime
  const totalFetched = fetchResults.reduce((s, r) => s + r.fetched, 0)
  const totalBlocked = fetchResults.reduce((s, r) => s + r.blocked, 0)
  const totalDead = fetchResults.reduce((s, r) => s + r.dead, 0)

  // 更新日志记录
  if (logId) {
    const hasFetchError = fetchResults.some((r) => r.error)
    const hasLlmError = processResults.some((r) => r.error)
    const status = hasFetchError || hasLlmError ? 'error' : 'success'
    const errorMessages = [
      ...fetchResults.filter((r) => r.error).map((r) => `[${r.source}] ${r.error}`),
      ...processResults.filter((r) => r.error).map((r) => `[LLM] ${r.error}`),
    ]

    await supabase
      .from('cron_logs')
      .update({
        ended_at: new Date().toISOString(),
        fetch_total_fetched: totalFetched,
        fetch_total_inserted: totalInserted,
        llm_pending: pendingArticles?.length ?? 0,
        llm_processed: processedCount,
        llm_failed: (pendingArticles?.length ?? 0) - processedCount,
        status,
        error_message: errorMessages.length > 0 ? errorMessages.join('; ') : null,
        details: { fetchResults, qualityResults: processResults, elapsedMs: elapsed },
      })
      .eq('id', logId)
  }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      fetch: {
        scheduling: 'tiered',
        batchSize,
        totalActiveSources: activeSources.length,
        eligibleSources: eligibleSources.length,
        processedSources: scheduledSources.length,
        totalFetched,
        totalBlocked,
        totalDead,
        totalInserted,
        results: fetchResults,
      },
      llm: {
        pending: pendingArticles?.length ?? 0,
        processed: processedCount,
        failed: (pendingArticles?.length ?? 0) - processedCount,
        results: processResults,
      },
    })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[fetch-and-process] 未捕获异常:', message)

    // 更新日志为失败状态
    if (logId) {
      await supabase
        .from('cron_logs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'error',
          error_message: message,
        })
        .eq('id', logId)
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
