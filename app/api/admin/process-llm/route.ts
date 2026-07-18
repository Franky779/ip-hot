import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { shouldIgnoreArticle } from '@/lib/llm'
import { enforceDirectIndustryScore, INDUSTRY_SCOPE_RULES } from '@/lib/relevance'

export const runtime = 'nodejs'
export const maxDuration = 60

const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'kimi-for-coding'
const BACKUP_URL = process.env.LLM_BACKUP_URL || ''
const BACKUP_KEY = process.env.LLM_BACKUP_KEY || ''
const BACKUP_MODEL = process.env.LLM_BACKUP_MODEL || 'deepseek-chat'

const CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺',
  '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化',
  '政策规则', '版权保护', '待分类',
]

const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。请对以下新闻进行分析：
${INDUSTRY_SCOPE_RULES}

【直接相关性门槛】只有新闻的核心事件、产品、交易对象或主要参与者直接属于动漫、漫画、IP开发、品牌授权、潮玩谷子、衍生品、文创、博物馆文创、文旅项目、主题乐园、城市IP、旅游纪念品等目标行业，评分才允许达到7分。
泛AI、泛科技、泛财经、泛消费或泛政策资讯，即使可能影响、支持或可用于目标行业，也属于间接相关，最高3分。AI资讯只有在明确报道新技术用于具体动画、IP、授权、潮玩、博物馆或文旅项目时，才属于直接相关。禁止从无关新闻中强行提炼IP或文旅角度。

1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下12个分类中选一个最贴切的：创作/上新、IP/品牌/授权、潮玩谷子、零售/渠道、影视综艺、游戏/体育、AI/新技术、展会活动、文旅及商品、艺术/亚文化、政策规则、版权保护、待分类
4. 给出 0-10 的产业匹配度评分：7-10为直接相关；4-6为边界待审；0-3为间接相关或无关
5. 如果评分>=7，标记为精选
6. 一句话行业解读（犀利、有洞察，20字以内）

请严格按JSON格式返回：{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function callLLM(title: string, baseUrl: string, apiKey: string, model: string): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000) // 20s 超时
  // 兼容 baseUrl 可能已带 /v1 或 /v1/messages 的情况
  const normalizedUrl = baseUrl.replace(/\/v1(\/messages)?\/?$/, '') + '/v1/messages'
  const res = await fetch(normalizedUrl, {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: `标题: ${title}` }], temperature: 0.2, max_tokens: 500 }),
  })
  clearTimeout(timeout)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text.slice(0, 120)}`)
  }
  const data = await res.json()
  const raw = data.content?.[0]?.text ?? ''
  if (!raw) throw new Error('Empty response')
  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) throw new Error(`No JSON in: ${raw.slice(0, 80)}`)
  const parsed = JSON.parse(jsonMatch[0])
  const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类'
  const parsedScore = Number(parsed.relevance_score)
  const modelScore = Number.isFinite(parsedScore) ? Math.min(10, Math.max(0, parsedScore)) : 5
  const score = enforceDirectIndustryScore(title, category, modelScore)
  return {
    title_cn: String(parsed.title_cn || title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score: score,
    is_selected: score >= 7,
    commentary: String(parsed.commentary || '').slice(0, 100),
  }
}

/** 带重试+备选模型的 summarize，返回时附带首个实际错误 */
async function summarizeArticle(title: string): Promise<any> {
  let lastError = ''

  // 主力 Kimi 3 次重试
  for (let i = 0; i < 3; i++) {
    try { return await callLLM(title, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!lastError) lastError = `Kimi[${i}]: ${msg}`
    }
    if (i < 2) await sleep(2000)
  }

  // 备选 DeepSeek 2 次重试
  if (BACKUP_URL && BACKUP_KEY) {
    for (let i = 0; i < 2; i++) {
      try { return await callLLM(title, BACKUP_URL, BACKUP_KEY, BACKUP_MODEL) } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!lastError) lastError = `DS[${i}]: ${msg}`
      }
      if (i < 1) await sleep(2000)
    }
  }

  throw new Error(`LLM all attempts failed: ${lastError}`)
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('x-admin-password')
  if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const BATCH_SIZE = 3  // Vercel 60s 上限内处理 3 条（每条约 10-15s），留足安全余量

  const { data: pending, error } = await supabase
    .from('articles')
    .select('id, title')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const batchTotal = pending?.length ?? 0
  if (!batchTotal) return NextResponse.json({ ok: true, processed: 0 })

  // === 第一阶段：写入 running 日志 ===
  const { data: logRecord, error: logErr } = await supabase
    .from('cron_logs')
    .insert({
      trigger_type: 'manual_llm',
      status: 'running',
      llm_pending: batchTotal,
      details: { batch_total: batchTotal, action: 'manual_llm' },
    })
    .select('id')
    .single()

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  const logId = logRecord.id

  // === 安全超时守护：45秒后若仍未完成，强制更新日志并返回 ===
  let completed = false
  const timeoutGuard = setTimeout(async () => {
    if (completed) return
    try {
      await supabase.from('cron_logs').update({
        status: 'error',
        ended_at: new Date().toISOString(),
        error_message: 'Vercel函数即将超时，任务被安全终止',
        details: { timeout_reason: 'vercel_60s_guard', batch_total: batchTotal },
      }).eq('id', logId)
    } catch {}
  }, 45000)

  // === 第二阶段：并发处理 ===
  // 全部并行跑 LLM + 数据库更新，3 条约 30-45s
  const results = await Promise.allSettled(
    pending.map(async (article) => {
      const result = await summarizeArticle(article.title)
      if (shouldIgnoreArticle(result.relevance_score, result.commentary)) {
        // 删除失败时改为标记为已忽略，避免同一批文章反复进入队列空转
        const { error: deleteError } = await supabase.from('articles').delete().eq('id', article.id)
        if (deleteError) {
          console.warn('[process-llm] 删除无关文章失败，改为标记为已忽略:', deleteError.message, 'articleId:', article.id)
          const { error: markError } = await supabase.from('articles').update({
            title_cn: article.title.slice(0, 60),
            summary_cn: '',
            category: '待分类',
            relevance_score: 0,
            is_selected: false,
            commentary: '',
          }).eq('id', article.id)
          if (markError) {
            console.error('[process-llm] 标记已忽略也失败:', markError.message)
            throw new Error(`删除并标记无关文章均失败: ${deleteError.message}; ${markError.message}`)
          }
        }
        return { status: 'irrelevant' }
      }
      const { error: upErr } = await supabase
        .from('articles')
        .update({
          title_cn: result.title_cn,
          summary_cn: result.summary_cn,
          category: result.category,
          relevance_score: result.relevance_score,
          is_selected: result.is_selected,
          commentary: result.commentary,
        })
        .eq('id', article.id)
      if (upErr) throw new Error(upErr.message)
      return { status: 'ok' }
    })
  )

  // 标记处理已完成，取消超时守护
  completed = true
  clearTimeout(timeoutGuard)

  let processed = 0
  let failed = 0
  let irrelevantDeleted = 0
  let firstError: string | null = null

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const v = r.value
      if (v.status === 'irrelevant') { irrelevantDeleted++; continue }
      processed++
    } else {
      const msg = (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200)
      if (!firstError) firstError = msg
      failed++
    }
  }

  try {
    // 查剩余队列
    const { count: remaining } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .is('title_cn', null)

    // === 第三阶段：更新日志为 success ===
    await supabase.from('cron_logs').update({
      status: 'success',
      ended_at: new Date().toISOString(),
      llm_processed: processed,
      llm_failed: failed,
      llm_pending: remaining ?? 0,
      details: {
        batch_total: batchTotal,
        batch_processed: processed,
        batch_failed: failed,
        batch_irrelevant_deleted: irrelevantDeleted,
        first_error: firstError,
        action: 'manual_llm',
      },
    }).eq('id', logId)

    return NextResponse.json({ ok: true, processed, failed, remaining: remaining ?? 0, irrelevantDeleted, firstError })
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('cron_logs').update({
      status: 'error',
      ended_at: new Date().toISOString(),
      llm_processed: processed,
      llm_failed: failed,
      error_message: msg,
      details: {
        batch_total: batchTotal,
        batch_processed: processed,
        batch_failed: failed,
        first_error: firstError,
        action: 'manual_llm',
      },
    }).eq('id', logId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
