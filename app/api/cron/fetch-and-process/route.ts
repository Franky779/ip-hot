import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { RSS_SOURCES } from '@/lib/sources'
import { execSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 60

const parser = new Parser({ timeout: 15000 })

async function fetchFeedWithFallback(url: string): Promise<Parser.Output<{
  [key: string]: any
}> | null> {
  // 1. 先用普通 fetch 尝试
  try {
    const feed = await parser.parseURL(url)
    return feed
  } catch {
    // 2. 失败后用 Scrapling fallback（反检测 Chromium）
    const tmpFile = join(tmpdir(), `rss-${Date.now()}.xml`)
    const pythonExe = process.env.SCRAPLING_PYTHON || 'D:\\claudecode\\.venv-scrapling\\Scripts\\python.exe'
    const scriptPath = 'D:\\claudecode\\临时文件夹\\github网页\\ip-hot\\scripts\\fetch-rss-scrapling.py'
    try {
      execSync(`"${pythonExe}" "${scriptPath}" "${url}" "${tmpFile}"`, {
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
  inserted: number
  error?: string
}

type ProcessResult = {
  id: string
  ok: boolean
  error?: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startTime = Date.now()

  // ===== 第1步：抓取 RSS =====
  const fetchResults: FetchResult[] = []
  let totalInserted = 0

  for (const source of RSS_SOURCES) {
    const result: FetchResult = { source: source.name, ok: false, fetched: 0, blocked: 0, inserted: 0 }

    try {
      const feed = await fetchFeedWithFallback(source.url)
      if (!feed) {
        result.error = 'RSS fetch failed (including Scrapling fallback)'
        fetchResults.push(result)
        continue
      }
      const rawItems = feed.items
        .map((item) => ({
          source: source.name,
          url: item.link ?? '',
          title: item.title ?? '',
          published_at: item.isoDate ?? null,
        }))
        .filter((x) => x.url.length > 0 && x.title.length > 0)

      const items = rawItems.filter((x) => !isNoise(x.title))
      result.fetched = items.length
      result.blocked = rawItems.length - items.length

      if (items.length > 0) {
        const { data, error } = await supabase
          .from('articles')
          .upsert(items, { onConflict: 'source,url', ignoreDuplicates: true })
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
  }

  // ===== 第2步：对新文章跑 LLM =====
  // max_tokens=3000 后每条LLM约40-60秒，4条约40-60秒，控制在60秒超时内
  const LLM_BATCH_SIZE = 4

  const { data: pendingArticles, error: pendingError } = await supabase
    .from('articles')
    .select('id, title, url, published_at')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(LLM_BATCH_SIZE)

  let processResults: ProcessResult[] = []
  let processedCount = 0

  if (!pendingError && pendingArticles && pendingArticles.length > 0) {
    processResults = await Promise.all(
      pendingArticles.map(async (article): Promise<ProcessResult> => {
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
            return { id: article.id, ok: !updateError, error: updateError?.message }
          }

          const { error: updateError } = await supabase
            .from('articles')
            .update({
              title_cn: llmResult.title_cn,
              summary_cn: llmResult.summary_cn,
              category: llmResult.category,
              relevance_score: llmResult.relevance_score,
              is_selected: llmResult.is_selected,
              commentary: llmResult.commentary,
            })
            .eq('id', article.id)

          return { id: article.id, ok: !updateError, error: updateError?.message }
        } catch (e) {
          return { id: article.id, ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      })
    )
    processedCount = processResults.filter((r) => r.ok).length
  }

  const elapsed = Date.now() - startTime

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    elapsedMs: elapsed,
    fetch: {
      totalFetched: fetchResults.reduce((s, r) => s + r.fetched, 0),
      totalBlocked: fetchResults.reduce((s, r) => s + r.blocked, 0),
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
}
