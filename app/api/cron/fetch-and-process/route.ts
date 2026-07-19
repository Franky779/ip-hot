import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { findSourceConfiguration, RSS_SOURCES, NEW_SOURCE_NAMES, type ScrapeConfig } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'
import { checkLinks } from '@/lib/link-checker'
import { execFileSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 300

const parser = new Parser({ timeout: 15000 })

type RuntimeSource = {
  name: string
  url: string
  fetchType: 'rss' | 'web'
  scrapeConfig?: ScrapeConfig
}

async function loadActiveSources(supabase: ReturnType<typeof createServiceClient>): Promise<RuntimeSource[]> {
  const { data, error } = await supabase
    .from('info_sources')
    .select('name, url, fetch_type')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })

  if (!error) {
    return (data ?? []).flatMap((source): RuntimeSource[] => {
      const configuredSource = findSourceConfiguration(source.url, source.name)
      if (configuredSource?.loginRequired || configuredSource?.needsLocalCdp) {
        return []
      }
      const fetchType =
        configuredSource?.type === 'rss' || configuredSource?.isRss
          ? 'rss'
          : source.fetch_type === 'rss'
            ? 'rss'
            : 'web'
      return [{
        name: source.name,
        url: configuredSource?.url || source.url,
        fetchType,
        scrapeConfig: configuredSource?.scrapeConfig || (
          fetchType === 'web' ? { adapter: 'auto-news-links', maxItems: 10 } : undefined
        ),
      }]
    })
  }

  // 数据库迁移执行前保持现有任务可用，避免部署过程停止抓取。
  console.warn('[Sources] 数据库运行字段尚不可用，暂用代码内 RSS 清单:', error.message)
  return RSS_SOURCES.filter((source) => source.type === 'rss').map(({ name, url }) => ({
    name,
    url,
    fetchType: 'rss',
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
  fetched: number
  blocked: number
  dead: number
  inserted: number
  error?: string
}

type ProcessResult = {
  id: string
  ok: boolean
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

  const allActiveSources = await loadActiveSources(supabase)
  const batchSize = 24
  const totalBatches = Math.max(1, Math.ceil(allActiveSources.length / batchSize))
  const requestUrl = new URL(request.url)
  const requestedBatchParam = requestUrl.searchParams.get('batch')
  const requestedBatch = requestedBatchParam === null ? Number.NaN : Number(requestedBatchParam)
  const scheduleHours = [4, 9, 14, 23]
  const now = new Date()
  const scheduleSlot = scheduleHours.indexOf(now.getUTCHours())
  const fallbackSlot = Math.floor(now.getUTCHours() / 6)
  const runNumber =
    Math.floor(now.getTime() / 86_400_000) * scheduleHours.length +
    (scheduleSlot >= 0 ? scheduleSlot : fallbackSlot)
  const batchIndex =
    Number.isInteger(requestedBatch) && requestedBatch >= 0
      ? requestedBatch % totalBatches
      : runNumber % totalBatches
  const batchStart = batchIndex * batchSize
  const activeSources = allActiveSources.slice(batchStart, batchStart + batchSize)
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

  for (const source of activeSources) {
    const result: FetchResult = { source: source.name, ok: false, fetched: 0, blocked: 0, dead: 0, inserted: 0 }

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
            return { id: article.id, ok: !updateError, error: updateError?.message }
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
          return { id: article.id, ok: !updateError, error: updateError?.message }
        } catch (e) {
          return { id: article.id, ok: false, error: e instanceof Error ? e.message : String(e) }
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
        details: { fetchResults, processResults, elapsedMs: elapsed },
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
        totalActiveSources: allActiveSources.length,
        processedSources: activeSources.length,
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
