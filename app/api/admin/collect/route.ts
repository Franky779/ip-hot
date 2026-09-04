// app/api/admin/collect/route.ts — 随手收：粘贴微信文章链接 → 抓取全文 → LLM 分类 → 入库 + 登记来源
// 手动收录的文章带 is_manual=true 标记：不被低分自动清理、不落待分类重跑队列

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { summarizeArticle } from '@/lib/llm'
import { extractWechatUrl, fetchWechatArticle, WechatFetchError } from '@/lib/wechat-article'
import {
  COLLECT_SECTION,
  COLLECT_SOURCE_TYPE,
  MANUAL_SELECTION_THRESHOLD,
  resolveManualClassification,
} from '@/lib/manual-collect'
import { REVIEW_CATEGORY } from '@/lib/pending-classification'

export const runtime = 'nodejs'
export const maxDuration = 300

const FETCH_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  invalid_url: { status: 400, message: '没识别到有效的微信文章链接，请确认粘贴的是 mp.weixin.qq.com 地址' },
  deleted: { status: 422, message: '这篇文章已被删除、违规不可见或链接已过期' },
  blocked: { status: 502, message: '微信拦截了服务器访问，请稍后再试' },
  fetch_failed: { status: 502, message: '抓取文章失败（网络或对方服务问题），请稍后再试' },
  parse_failed: { status: 422, message: '页面结构无法解析，这篇文章暂时收不了' },
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof WechatFetchError) {
    const mapped = FETCH_ERROR_MESSAGES[error.kind] ?? { status: 500, message: fallback }
    return NextResponse.json({ error: mapped.message, kind: error.kind }, { status: mapped.status })
  }
  const message = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: `${fallback}：${message}` }, { status: 500 })
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let text = ''
  try {
    const body = await request.json()
    text = typeof body?.text === 'string' ? body.text : ''
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const url = extractWechatUrl(text)
  if (!url) {
    return NextResponse.json(
      { error: FETCH_ERROR_MESSAGES.invalid_url.message, kind: 'invalid_url' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // 1. 全库按 URL 去重（不限来源，防跨源重复）
  const { data: existing, error: dedupError } = await supabase
    .from('articles')
    .select('id, source, title, title_cn, summary_cn, category, relevance_score, commentary, is_manual')
    .eq('url', url)
    .limit(1)
    .maybeSingle()

  if (dedupError) {
    return NextResponse.json({ error: `数据库查询失败：${dedupError.message}` }, { status: 500 })
  }
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, article: existing })
  }

  // 2. 抓取微信文章全文
  let article
  try {
    article = await fetchWechatArticle(url)
  } catch (error) {
    return errorResponse(error, '抓取文章失败')
  }

  // 3. 同步调 LLM 分类（带正文前 3000 字，分类质量高于自动管线的纯标题）
  const llmOutcome = await summarizeArticle(article.title, article.content.slice(0, 3000))
  const llmResult = llmOutcome.ok ? llmOutcome.result : null

  if (llmResult?.safety_blocked) {
    return NextResponse.json({ error: '内容未通过安全审查，未收录', kind: 'safety_blocked' }, { status: 422 })
  }

  // LLM 三家全挂时降级：仍收录，进待人工复核，评分留空（不上首页但绝不丢失）
  const classification = llmResult
    ? resolveManualClassification(llmResult)
    : {
        category: REVIEW_CATEGORY,
        relevance_score: null as number | null,
        is_selected: true,
        selection_threshold: MANUAL_SELECTION_THRESHOLD,
      }

  // 4. 入库 articles（is_manual 保护标记）
  const { data: inserted, error: insertError } = await supabase
    .from('articles')
    .insert({
      source: article.accountName ?? '微信公众号',
      url,
      title: article.title,
      title_cn: llmResult?.title_cn ?? article.title.slice(0, 60),
      summary_cn: llmResult?.summary_cn ?? '',
      category: classification.category,
      relevance_score: classification.relevance_score,
      is_selected: classification.is_selected,
      selection_threshold: classification.selection_threshold,
      commentary: llmResult?.commentary ?? null,
      published_at: article.publishedAt,
      image_url: article.coverUrl,
      is_video: false,
      is_manual: true,
    })
    .select('id')
    .single()

  if (insertError) {
    // (source, url) 唯一冲突 = 双击/重试竞态，按重复处理
    if (insertError.code === '23505') {
      const { data: raced } = await supabase
        .from('articles')
        .select('id, source, title, title_cn, summary_cn, category, relevance_score, commentary, is_manual')
        .eq('url', url)
        .limit(1)
        .maybeSingle()
      return NextResponse.json({ ok: true, duplicate: true, article: raced })
    }
    return NextResponse.json({ error: `入库失败：${insertError.message}` }, { status: 500 })
  }

  // 5. 登记/识别来源公众号（enabled=false 待升级；已是常驻 RSS 源则识别出来）
  let account: { name: string | null; isNewSource: boolean; sourceId: string | null; isResident: boolean } = {
    name: article.accountName,
    isNewSource: false,
    sourceId: null,
    isResident: false,
  }

  if (article.accountName) {
    const { data: existingSource } = await supabase
      .from('info_sources')
      .select('id, enabled, fetch_type')
      .eq('name', article.accountName)
      .limit(1)
      .maybeSingle()

    if (existingSource) {
      account = {
        name: article.accountName,
        isNewSource: false,
        sourceId: existingSource.id,
        isResident: existingSource.enabled === true && existingSource.fetch_type === 'rss',
      }
    } else {
      const { data: newSource, error: sourceError } = await supabase
        .from('info_sources')
        .insert({
          section_id: COLLECT_SECTION.id,
          section_title: COLLECT_SECTION.title,
          region: COLLECT_SECTION.region,
          name: article.accountName,
          url,
          type: COLLECT_SOURCE_TYPE,
          description: `随手收登记，可升级为常驻信息源；首篇：《${article.title.slice(0, 40)}》`,
          method: '',
          fetch_type: 'web',
          enabled: false,
          sort_order: 0,
        })
        .select('id')
        .single()
      if (sourceError) {
        // 来源登记失败不影响文章已收录的事实，仅在响应里标注
        console.error('[collect] info_sources insert failed:', sourceError.message)
      } else {
        account = { name: article.accountName, isNewSource: true, sourceId: newSource.id, isResident: false }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    article: {
      id: inserted.id,
      title: article.title,
      title_cn: llmResult?.title_cn ?? article.title.slice(0, 60),
      summary_cn: llmResult?.summary_cn ?? '',
      category: classification.category,
      relevance_score: classification.relevance_score,
      commentary: llmResult?.commentary ?? null,
      coverUrl: article.coverUrl,
      publishedAt: article.publishedAt,
    },
    account,
    llm: llmResult ? 'ok' : 'degraded',
    fetchVia: article.fetchVia,
  })
}
