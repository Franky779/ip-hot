#!/usr/bin/env node
// scripts/eval-selection.mjs — 离线评估脚本（方案文档 B3 配套工具 / B1 五轴改造的验证地基）
//
// 用途：把 data/gold.jsonl 里人工标注过的文章重新喂给当前打分提示词，
//       输出新旧分数对照、门槛扫描表（精确率/召回率/F1）、分数漂移、逐条判错清单。
//       改提示词 / 换模型 / 调门槛之前先跑一遍，不拿线上当试验田。
//
// 与生产同构（必须保持，改 lib/llm.ts 打分逻辑时同步改这里，部署测试会提醒）：
//   - system = prompts/article-score.md 渲染 {{INDUSTRY_SCOPE}}/{{SAFETY_GATE}} + 学习规则注入
//   - user   = `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`
//   - 参数 temperature 0.2 / max_tokens 3000，取响应里第一个 JSON 对象
//   - 分数后处理与 lib/relevance.ts 完全一致（直接 import，不复制规则）
// 与生产不同（有意为之）：
//   - 不写打分回执、不走预算熔断（评估调用不占线上配额、不污染回执表）
//   - 不复用历史回执（每次都是新打分，才能测出提示词改动的真实效果）
//
// 学习规则注入：与 lib/classification-learning.ts 同构复刻（关键词提取 + overlaps 匹配 + 追加段）。
// 生产打分注入了 classification_learnings，评估若跳过会让漂移混入「缺学习规则」的噪声。
//
// 用法（在服务器 release 目录或本地，需先导出 DATABASE_URL 与 LLM_* 环境变量）：
//   node scripts/eval-selection.mjs                          # 全量 106 条，跑 1 次
//   node scripts/eval-selection.mjs --runs 3                 # 每条打 3 次分（测方差，服务 B1 两次独立打分）
//   node scripts/eval-selection.mjs --limit 10 --dry-run     # 只验证链路，用库里的旧分算指标，不调 LLM
//   node scripts/eval-selection.mjs --model deepseek-v4-flash --tag after-prompt-edit
//
// 环境变量：DATABASE_URL 必需；LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 必需（--dry-run 除外）；
//          备用通道 LLM_BACKUP_URL/LLM_BACKUP_KEY/LLM_BACKUP_MODEL 可选。
// 产物：data/eval-results/eval-<时间戳>-<tag>.json（逐条明细）+ 同名 .md（报告）

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { INDUSTRY_SCOPE_RULES, applyDirectCategoryScoreFloor, enforceDirectIndustryScore } from '../lib/relevance.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GOLD_PATH = path.join(ROOT, 'data', 'gold.jsonl')
const PROMPT_PATH = path.join(ROOT, 'prompts', 'article-score.md')
const OUT_DIR = path.join(ROOT, 'data', 'eval-results')

// 与 lib/llm.ts 的 CATEGORIES 保持一致（那边带 supabase 依赖无法直接 import，部署测试有断言守着）
const CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺', '游戏/体育',
  'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化', '政策规则', '版权保护', '待分类',
]

const SAFETY_GATE =
  'Safety gate: set safety_blocked=true for violence, gore, politics, ideology, China sovereignty or territorial disputes, separatism, religious extremism, racism, war, military, weapons, LGBT or gender controversy, or other content that violates mainland China political, ideological, geographic, or religious requirements. Otherwise set false.'

// ---------- 参数 ----------
const args = process.argv.slice(2)
function argOf(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const hasFlag = (name) => args.includes(name)
const LIMIT = Number(argOf('--limit', 0)) || Infinity
const RUNS = Math.max(1, Number(argOf('--runs', 1)))
const CONCURRENCY = Math.max(1, Number(argOf('--concurrency', 3)))
const FOCUS_THRESHOLD = Number(argOf('--threshold', 7))
const TAG = argOf('--tag', 'run')
const DRY_RUN = hasFlag('--dry-run')
const MODEL_OVERRIDE = argOf('--model', '')

function loadEnvFile(file) {
  if (!file || !existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}
loadEnvFile(argOf('--env', ''))

// ---------- 提示词（与 lib/prompts.ts 同构：sha256 前 12 位为版本号） ----------
const PROMPT_RAW = readFileSync(PROMPT_PATH, 'utf8')
const PROMPT_VERSION = createHash('sha256').update(PROMPT_RAW).digest('hex').slice(0, 12)
const SYSTEM_PROMPT = PROMPT_RAW
  .replace('{{INDUSTRY_SCOPE}}', INDUSTRY_SCOPE_RULES)
  .replace('{{SAFETY_GATE}}', SAFETY_GATE)

const PROVIDERS = [
  {
    name: 'DeepSeek',
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: MODEL_OVERRIDE || process.env.LLM_MODEL || 'deepseek-v4-flash',
    attempts: 3,
  },
  {
    name: 'Kimi',
    baseUrl: process.env.LLM_BACKUP_URL,
    apiKey: process.env.LLM_BACKUP_KEY,
    model: MODEL_OVERRIDE || process.env.LLM_BACKUP_MODEL || 'kimi-k2.6',
    attempts: 2,
  },
].filter((p) => p.baseUrl && p.apiKey)

// ---------- 数据 ----------
const gold = readFileSync(GOLD_PATH, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line))
  .slice(0, LIMIT)

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const ids = gold.map((g) => g.article_id)
const { rows: articles } = await db.query(
  `select id, title, title_cn, summary_cn, source, relevance_score, category, published_at
   from articles where id = any($1::uuid[])`,
  [ids],
)
await db.end()
const byId = new Map(articles.map((a) => [a.id, a]))

const missing = gold.filter((g) => !byId.has(g.article_id))
let learningsInjected = 0

// ---------- 学习规则注入（与 lib/classification-learning.ts 同构复刻） ----------
const LEARNING_STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '又', '与', '及',
  '等', '以', '为', '之', '而', '或', '但', '从', '将', '被', '把', '向', '于', '对', '给', '让',
  '比', '当', '还', '只', '最', '更', '太', '非常', '已经', '现在', '今天', '今年', '公司', '品牌',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'or', 'but', 'if', 'then',
  'else', 'because', 'until', 'while', 'about', 'against', 'up', 'down', 'out', 'off', 'over',
])
function extractKeywords(title) {
  const keywords = []
  for (const word of title.match(/[一-龥]{2,6}/g) || []) {
    if (!LEARNING_STOP_WORDS.has(word)) keywords.push(word)
  }
  for (const word of title.match(/[a-zA-Z]{2,}/g) || []) {
    const lower = word.toLowerCase()
    if (!LEARNING_STOP_WORDS.has(lower)) keywords.push(lower)
  }
  return [...new Set(keywords)].slice(0, 20)
}
async function fetchLearningsFor(dbClient, title) {
  const keywords = extractKeywords(title)
  if (!keywords.length) return []
  const { rows } = await dbClient.query(
    `select original_title, corrected_category, match_count
     from classification_learnings
     where is_active = true and title_keywords && $1::text[]
     order by match_count desc, updated_at desc
     limit 15`,
    [keywords],
  )
  return rows
}
function formatLearningRules(learnings) {
  if (!learnings.length) return ''
  const lines = learnings
    .map((l) => `  - "${l.original_title.slice(0, 50)}" → ${l.corrected_category} (被确认${l.match_count}次)`)
    .join('\n')
  return `\n\n【历史学习规则】以下是管理员人工确认过的分类案例，请作为参考优先遵循（尤其当标题关键词与以下案例相似时）：\n${lines}\n`
}

const samples = gold
  .filter((g) => byId.has(g.article_id))
  .map((g) => {
    const a = byId.get(g.article_id)
    const title = a.title_cn || a.title
    // articles 表不存原文（打分时原文用完即弃），评估输入用「标题 + 中文摘要」代替原文。
    // 摘要本身就是打分那次 LLM 调用产出的压缩版，信息足够判相关性，但分数可能与生产值有小偏差。
    const content = a.summary_cn || ''
    return {
      article_id: g.article_id,
      title,
      source: a.source,
      gold_label: g.label,
      old_score: a.relevance_score,
      old_category: a.category,
      userPrompt: `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`,
      systemPrompt: SYSTEM_PROMPT, // 学习规则在下面按条注入
    }
  })

// 按条查学习规则并追加到 system prompt（与生产 summarizeArticle 行为一致）
{
  const ldb = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await ldb.connect()
  let injected = 0
  for (const sample of samples) {
    try {
      const learnings = await fetchLearningsFor(ldb, sample.title)
      if (learnings.length) {
        sample.systemPrompt += formatLearningRules(learnings)
        injected++
      }
    } catch { /* 学习查询失败不阻塞评估，只是少注入 */ }
  }
  await ldb.end()
  learningsInjected = injected
}

console.log(`样本 ${samples.length}/${gold.length} 条（缺库 ${missing.length} 条）；runs=${RUNS}；并发=${CONCURRENCY}`)
console.log(`提示词版本 ${PROMPT_VERSION}；模型 ${PROVIDERS[0]?.model ?? '(dry-run)'}；学习规则注入 ${learningsInjected}/${samples.length} 条样本`)
if (missing.length) console.warn(`警告：${missing.length} 条 gold 记录在 articles 表找不到，已跳过`)

// ---------- LLM 调用（不走回执/预算，参数与生产 callProvider 一致） ----------
// B1 起返回体含嵌套 axes 对象，不能用惰性正则（会在第一个 } 处截断）。
// 与 lib/llm.ts 的 extractJsonObject 同构：整串 parse → 贪婪截取 → 平衡扫描。
function extractJsonObject(raw) {
  const trimmed = raw.trim()
  try { return JSON.parse(trimmed) } catch { /* 继续尝试 */ }
  const start = trimmed.indexOf('{')
  if (start === -1) throw new Error(`No JSON in: ${trimmed.slice(0, 120)}`)
  const end = trimmed.lastIndexOf('}')
  if (end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { /* 走平衡扫描 */ }
  }
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return JSON.parse(trimmed.slice(start, i + 1))
    }
  }
  throw new Error(`No JSON in: ${trimmed.slice(0, 120)}`)
}

async function callScore(sample) {
  const failures = []
  for (const provider of PROVIDERS) {
    for (let i = 0; i < provider.attempts; i++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90_000)
      try {
        const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: sample.systemPrompt },
              { role: 'user', content: sample.userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 3000,
          }),
        })
        if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
        const data = await res.json()
        const raw = data.choices?.[0]?.message?.content ?? ''
        const parsed = extractJsonObject(raw)
        // 与 lib/llm.ts parseResult 相同的分数后处理
        const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类'
        const modelScore = Number.isFinite(Number(parsed.relevance_score))
          ? Math.min(10, Math.max(0, Number(parsed.relevance_score)))
          : 5
        const score = applyDirectCategoryScoreFloor(category, enforceDirectIndustryScore(sample.title, category, modelScore))
        return {
          ok: true, score, category, model: provider.model,
          promptTokens: data.usage?.prompt_tokens ?? null,
          completionTokens: data.usage?.completion_tokens ?? null,
        }
      } catch (e) {
        const message = e instanceof Error ? e.message.slice(0, 160) : String(e)
        failures.push(`${provider.name}#${i + 1}: ${message}`)
        // 生产端对「内容安全拦截」会跳过同 provider 重试；脚本侧无法可靠细分，统一保守重试
        // （代价只是多花两次重试，不会造成漏判）
        await new Promise((r) => setTimeout(r, 2000))
      } finally {
        clearTimeout(timer)
      }
    }
  }
  return { ok: false, error: failures.join(' | ').slice(0, 400) }
}

// ---------- 执行 ----------
const startedAt = Date.now()
let done = 0
const results = []
async function worker(queue) {
  for (;;) {
    const sample = queue.shift()
    if (!sample) return
    const runs = []
    for (let r = 0; r < RUNS; r++) {
      const out = DRY_RUN
        ? { ok: true, score: sample.old_score, category: sample.old_category, model: 'dry-run(old-db-score)', promptTokens: null, completionTokens: null }
        : await callScore(sample)
      runs.push(out)
      if (!out.ok) break
    }
    const okRuns = runs.filter((r) => r.ok)
    results.push({
      ...sample,
      runs,
      new_scores: okRuns.map((r) => r.score),
      new_score_avg: okRuns.length ? okRuns.reduce((s, r) => s + r.score, 0) / okRuns.length : null,
      new_category: okRuns[0]?.category ?? null,
      model: okRuns[0]?.model ?? null,
      tokens: okRuns.reduce((s, r) => s + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0),
      error: okRuns.length ? null : runs[0]?.error ?? 'unknown',
    })
    done++
    const last = okRuns[0]
    process.stdout.write(`[${done}/${samples.length}] gold=${sample.gold_label} old=${sample.old_score} new=${last ? last.score : 'ERR'} ${sample.title.slice(0, 24)}\n`)
  }
}
const queue = [...samples]
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, samples.length) }, () => worker(queue)))
const elapsed = Math.round((Date.now() - startedAt) / 1000)

// ---------- 指标 ----------
const valid = results.filter((r) => r.new_score_avg !== null)
function prf(items, key, t) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const it of items) {
    const selected = it[key] >= t
    const relevant = it.gold_label === 1
    if (relevant && selected) tp++
    else if (!relevant && selected) fp++
    else if (relevant && !selected) fn++
    else tn++
  }
  const p = tp + fp ? tp / (tp + fp) : null
  const r = tp + fn ? tp / (tp + fn) : null
  const f1 = p && r ? (2 * p * r) / (p + r) : null
  return { t, tp, fp, fn, tn, precision: p, recall: r, f1 }
}
const pct = (x) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`)
const sweepOld = []
const sweepNew = []
for (let t = 4; t <= 10; t++) {
  sweepOld.push(prf(valid, 'old_score', t))
  sweepNew.push(prf(valid, 'new_score_avg', t))
}
const diffs = valid.map((r) => r.new_score_avg - r.old_score)
const absDiff = diffs.map(Math.abs)
const drift = {
  n: valid.length,
  exact_match: diffs.filter((d) => d === 0).length,
  mean_abs_diff: absDiff.reduce((s, d) => s + d, 0) / (absDiff.length || 1),
  moved_up: diffs.filter((d) => d > 0).length,
  moved_down: diffs.filter((d) => d < 0).length,
  moved_2plus: diffs.filter((d) => Math.abs(d) >= 2).length,
}
let variance = null
if (RUNS > 1) {
  const spreads = valid.map((r) => {
    const s = r.new_scores
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
    return { max_minus_min: Math.max(...s) - Math.min(...s), sd }
  })
  const unstable = spreads.filter((s) => s.max_minus_min >= 2).length
  variance = {
    runs: RUNS,
    unstable_ge2: unstable,
    unstable_pct: spreads.length ? unstable / spreads.length : null,
    mean_sd: spreads.reduce((a, s) => a + s.sd, 0) / (spreads.length || 1),
  }
}
const fpList = valid.filter((r) => r.gold_label === 0 && r.new_score_avg >= FOCUS_THRESHOLD)
const fnList = valid.filter((r) => r.gold_label === 1 && r.new_score_avg < FOCUS_THRESHOLD)
const failed = results.filter((r) => r.new_score_avg === null)
const totalTokens = results.reduce((s, r) => s + r.tokens, 0)

// ---------- 报告 ----------
const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const base = `eval-${ts}-${TAG}`
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(path.join(OUT_DIR, `${base}.json`), JSON.stringify({
  meta: { at: new Date().toISOString(), model: PROVIDERS[0]?.model ?? 'dry-run', prompt_version: PROMPT_VERSION, runs: RUNS, focus_threshold: FOCUS_THRESHOLD, elapsed_s: elapsed, learnings_injected: learningsInjected },
  drift, variance, sweep_old: sweepOld, sweep_new: sweepNew,
  false_positives: fpList.map(pick), false_negatives: fnList.map(pick),
  failures: failed.map((r) => ({ article_id: r.article_id, title: r.title, error: r.error })),
  items: results.map((r) => ({ ...r, userPrompt: undefined, systemPrompt: undefined })),
}, null, 2))

function pick(r) {
  return {
    article_id: r.article_id, title: r.title, source: r.source,
    gold: r.gold_label, old: r.old_score, new: r.new_score_avg, category: r.new_category,
    note: r.new_score_avg >= FOCUS_THRESHOLD ? '误选：应拦' : '漏选：应选',
  }
}

const sweepRows = sweepNew.map((s, i) => {
  const o = sweepOld[i]
  return `| >=${s.t} | ${pct(o.precision)} / ${pct(o.recall)} / ${o.f1 === null ? '—' : o.f1.toFixed(3)} | ${pct(s.precision)} / ${pct(s.recall)} / ${s.f1 === null ? '—' : s.f1.toFixed(3)} |`
}).join('\n')

const focus = prf(valid, 'new_score_avg', FOCUS_THRESHOLD)
const listMd = (label, items) => items.length
  ? items.map((r) => `- 【${r.source}】${r.title}｜gold=${r.gold_label === 1 ? '相关' : '无关'}｜旧 ${r.old_score} → 新 ${r.new_score_avg}`).join('\n')
  : `- 无`

const report = `# 离线评估报告（${ts}，tag=${TAG}）

- 样本：${valid.length} 条（gold 共 ${gold.length}，缺库 ${missing.length}，调用失败 ${failed.length}）
- 模型：${PROVIDERS[0]?.model ?? 'dry-run'}；提示词版本：\`${PROMPT_VERSION}\`；每条打分 ${RUNS} 次；耗时 ${elapsed}s；tokens ${totalTokens}
- 学习规则注入：${learningsInjected}/${valid.length} 条样本（与生产行为一致，按标题关键词匹配 classification_learnings）
- 聚焦门槛：${FOCUS_THRESHOLD} → 精确率 ${pct(focus.precision)} / 召回率 ${pct(focus.recall)} / F1 ${focus.f1 === null ? '—' : focus.f1.toFixed(3)}（TP ${focus.tp} / FP ${focus.fp} / FN ${focus.fn}）

## 门槛扫描（精确率 / 召回率 / F1）

| 门槛 | 旧分（库内） | 新分（本次评估） |
|------|------------|----------------|
${sweepRows}

## 分数漂移（新 vs 旧）

- 完全一致：${drift.exact_match}/${drift.n}（${pct(drift.n ? drift.exact_match / drift.n : null)}）
- 平均绝对偏差：${drift.mean_abs_diff.toFixed(2)} 分；升 ${drift.moved_up} / 降 ${drift.moved_down} / 变动≥2 分 ${drift.moved_2plus}
${variance ? `- 同题重复打分方差：不稳定（极差≥2 分）${variance.unstable_ge2} 条（${pct(variance.unstable_pct)}），平均标准差 ${variance.mean_sd.toFixed(2)} —— 这是 B1「两次独立打分」设计的直接依据` : ''}

## 聚焦门槛 ${FOCUS_THRESHOLD} 下的判错清单

### 误选（gold=无关，新分 >= ${FOCUS_THRESHOLD}）
${listMd('FP', fpList)}

### 漏选（gold=相关，新分 < ${FOCUS_THRESHOLD}）
${listMd('FN', fnList)}

## 下一步

把误选/漏选逐条和提示词对照：判错集中在某类噪声 → 改 prompts/article-score.md 的压噪条款；
分数整体漂移 → 检查提示词版本是否变化；重复打分不稳定 → 支持 B1 两次打分取均值的设计。
改完再跑：node scripts/eval-selection.mjs --tag after-<改动说明>
`
writeFileSync(path.join(OUT_DIR, `${base}.md`), report)

console.log(`\n===== 摘要 =====`)
console.log(`聚焦门槛 ${FOCUS_THRESHOLD}：精确率 ${pct(focus.precision)} / 召回率 ${pct(focus.recall)} / F1 ${focus.f1?.toFixed(3) ?? '—'}`)
console.log(`漂移：一致 ${drift.exact_match}/${drift.n}，平均绝对差 ${drift.mean_abs_diff.toFixed(2)}`)
if (variance) console.log(`重复打分：不稳定 ${variance.unstable_ge2} 条（${pct(variance.unstable_pct)}），平均 sd ${variance.mean_sd.toFixed(2)}`)
console.log(`误选 ${fpList.length} 条 / 漏选 ${fnList.length} 条 / 失败 ${failed.length} 条`)
console.log(`报告：data/eval-results/${base}.md`)
