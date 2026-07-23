import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { findSourceConfiguration, RSS_SOURCES, NEW_SOURCE_NAMES, type ScrapeConfig } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'
import { checkLinks } from '@/lib/link-checker'
import { parseRequestedSourceIds, selectRequestedSources } from '@/lib/source-run-selection'
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
  scrapeConfig?: ScrapeConfig
  qualityMode: 'normal' | 'observe' | 'reduced' | 'paused'
}

async function loadSources(
  supabase: ReturnType<typeof createServiceClient>,
  requestedSourceIds: string[] = [],
): Promise<RuntimeSource[]> {
  const sourceQuery = supabase
    .from('info_sources')
    .select('id, name, url, fetch_type')

  const { data, error } = await (requestedSourceIds.length > 0
    ? sourceQuery.in('id', requestedSourceIds)
    : sourceQuery.eq('enabled', true))
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
      if (configuredSource?.loginRequired || configuredSource?.needsLocalCdp) {
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
        qualityMode: qualityModes.get(source.id) ?? 'normal',
        scrapeConfig: configuredSource?.scrapeConfig || (
          fetchType === 'web' ? { adapter: 'auto-news-links', maxItems: 10 } : undefined
        ),
      }]
    })
  }

  if (requestedSourceIds.length > 0) {
    throw new Error(`读取指定信息源失败：${error.message}`)
  }

  // 数据库迁移执行前保持现有任务可用，避免部署过程停止抓取。
  console.warn('[Sources] 数据库运行字段尚不可用，暂用代码内 RSS 清单:', error.message)
  return RSS_SOURCES.filter((source) => source.type === 'rss').map(({ name, url }) => ({
    id: name,
    name,
    url,
    fetchType: 'rss',
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

  const requestUrl = new URL(request.url)
  let requestedSourceIds: string[]
  try {
    requestedSourceIds = parseRequestedSourceIds(request.url)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
  if (requestedSourceIds.length > 0 && !isAdminAuth) {
    return NextResponse.json({ error: '只有管理员可以手动指定信息源。' }, { status: 403 })
  }
  const enqueueOnly = requestedSourceIds.length > 0 && requestUrl.searchParams.get('enqueueOnly') === '1'

  const supabase = createServiceClient()
  const startTime = Date.now()
  const triggerType = requestedSourceIds.length > 0 ? 'manual_source' : isAdminAuth ? 'manual' : 'cron'
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

  const loadedSources = await loadSources(supabase, requestedSourceIds)
  const batchSize = 24
  const requestedBatchParam = requestUrl.searchParams.get('batch')
  const requestedBatch = requestedBatchParam === null ? Number.NaN : Number(requestedBatchParam)
  const scheduleHours = [4, 9, 14, 23]
  const now = new Date()
  const scheduleSlot = scheduleHours.indexOf(now.getUTCHours())
  const fallbackSlot = Math.floor(now.getUTCHours() / 6)
  const runNumber =
    Math.floor(now.getTime() / 86_400_000) * scheduleHours.length +
    (scheduleSlot >= 0 ? scheduleSlot : fallbackSlot)
  const requestedSelection = selectRequestedSources(loadedSources, requestedSourceIds)
  if (requestedSelection.missingSourceIds.length > 0) {
    throw new Error(`指定信息源不存在或不支持云端抓取：${requestedSelection.missingSourceIds.join(', ')}`)
  }
  const eligibleSources = requestedSourceIds.length > 0
    ? requestedSelection.selectedSources
    : loadedSources.filter((source) => source.qualityMode !== 'reduced' || runNumber % 2 === 0)
  const totalBatches = Math.max(1, Math.ceil(eligibleSources.length / batchSize))
  const batchIndex = requestedSourceIds.length > 0
    ? 0
    :
    Number.isInteger(requestedBatch) && requestedBatch >= 0
      ? requestedBatch % totalBatches
      : runNumber % totalBatches
  const batchStart = batchIndex * batchSize
  const activeSources = requestedSourceIds.length > 0
    ? eligibleSources
    : eligibleSources.slice(batchStart, batchStart + batchSize)
  const updateFetchProgress = async (currentSource: string) => {
    await updateRunningLog({
      fetch_total_fetched: fetchResults.reduce((sum, item) => sum + item.fetched, 0),
      fetch_total_inserted: totalInserted,
      details: {
        stage: 'fetch',
        currentSource,
        sourcesCompleted: fetchResults.length,
        totalSources: activeSources.length,
      },
    })
  }

  const recordSourceFetchRun = async (source: RuntimeSource, result: FetchResult, startedAt: string) => {
    const sourceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source.id)
      ? source.id
      : null
    const { error } = await supabase.from('source_fetch_runs').insert({
      source_id: sourceId,
      source_name: source.name,
      source_url: source.url,
      cron_log_id: logId,
      trigger_type: triggerType,
      execution_mode: 'cloud',
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      status: result.error ? 'failed' : result.inserted > 0 ? 'success' : 'empty',
      discovered_count: result.discovered,
      fetched_count: result.fetched,
      blocked_count: result.blocked,
      dead_count: result.dead,
      duplicate_count: result.duplicates,
      inserted_count: result.inserted,
      error_message: result.error ?? null,
    })
    if (error) {
      console.error('[SourceFetchRun] 记录单源抓取结果失败:', error.message)
    }
  }

  for (const source of activeSources) {
    const result: FetchResult = { source: source.name, ok: false, discovered: 0, fetched: 0, blocked: 0, dead: 0, duplicates: 0, inserted: 0 }
    const sourceStartedAt = new Date().toISOString()

    try {
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
          continue
        }
        const scraped = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
        if (scraped.error) {
          result.error = scraped.error
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
    } finally {
      fetchResults.push(result)
      await recordSourceFetchRun(source, result, sourceStartedAt)
      await updateFetchProgress(source.name)
    }
  }

  // ===== 第2步：对新文章跑 LLM =====
  // max_tokens=3000 后每条LLM约40-60秒，4条约40-60秒，控制在60秒超时内
  const LLM_BATCH_SIZE = 8

  const pendingResult = enqueueOnly
    ? { data: [], error: null }
    : await supabase
      .from('articles')
      .select('id, title, url, source, published_at')
      .is('title_cn', null)
      .order('published_at', { ascending: false })
      .limit(LLM_BATCH_SIZE)
  const { data: pendingArticles, error: pendingError } = pendingResult

  let processResults: ProcessResult[] = []
  let processedCount = 0
  let llmCompletedCount = 0
  let llmProgressUpdate = Promise.resolve()

  await updateRunningLog({
    fetch_total_fetched: fetchResults.reduce((sum, item) => sum + item.fetched, 0),
    fetch_total_inserted: totalInserted,
    llm_pending: enqueueOnly ? totalInserted : pendingArticles?.length ?? 0,
    details: {
      stage: enqueueOnly ? 'queued' : 'llm',
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
        llm_pending: enqueueOnly ? totalInserted : pendingArticles?.length ?? 0,
        llm_processed: processedCount,
        llm_failed: (pendingArticles?.length ?? 0) - processedCount,
        status,
        error_message: errorMessages.length > 0 ? errorMessages.join('; ') : null,
        details: { fetchResults, qualityResults: processResults, elapsedMs: elapsed, enqueueOnly },
      })
      .eq('id', logId)
  }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      fetch: {
        batchIndex,
        totalBatches,
        batchSize,
        totalActiveSources: loadedSources.length,
        eligibleSources: eligibleSources.length,
        processedSources: activeSources.length,
        totalFetched,
        totalBlocked,
        totalDead,
        totalInserted,
        results: fetchResults,
      },
      llm: {
        enqueued: totalInserted,
        enqueueOnly,
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
