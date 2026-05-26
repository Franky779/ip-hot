// 批量抓取RSS源，LLM处理后入库
import Parser from 'rss-parser'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(fp) {
  try {
    const content = readFileSync(fp, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (key && !process.env[key]) process.env[key] = value
    }
  } catch {}
}
loadEnvFile(resolve(process.cwd(), '.env.local'))

const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || ''
const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat'

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`) }

// 读取源列表
const sourcesList = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/sources-list.json'), 'utf-8'))
const rssSources = sourcesList.filter(s => s.category === 'RSS')
log(`RSS源共 ${rssSources.length} 个`)

const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下7个分类中选一个最贴切的：
   - 新作发布：动漫/游戏/IP的新作品、新动画、新游戏发布
   - IP/品牌/授权：IP/品牌/授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态
   - 影视综艺：动漫改编电影/剧集、游戏改编影视、漫画改编影视、IP衍生影视内容、虚拟偶像综艺
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化
   - 待分类：无法明确归入以上6类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分。评分极其严格，以下类别一律给 0-3 分（直接淘汰）：
   - 纯AI/人工智能资讯、纯财经/股市资讯、纯科技/硬件资讯、纯政治/社会政策、纯医疗健康
   - 纯 Hollywood 真人剧集/电影评论（非动漫/游戏/IP改编的影视内容）
   - 纯餐饮/零售日常动态
   【重要】游戏行业新闻（如涉及游戏IP、动漫改编游戏、游戏授权合作、游戏周边/谷子等）属于本站覆盖范围，不要因"游戏"标签而压低分数，应按产业相关性正常评分
5. 如果产业匹配度评分 >= 8，标记为精选（is_selected = true）
6. 用一句话给出你的行业解读（犀利、有洞察、带观点，20字以内），不要加署名

【特别约束 — 争议性内容处理】
以下内容无论产业匹配度评分多高，一律强制归类为"待分类"，等待人工审核：
- 中国统一、台湾问题、香港问题、新疆问题、西藏问题等国家主权和领土完整相关议题
- 政治敏感话题、意识形态争论、政府体制批评、选举相关
- LGBT、性别认同、性取向、跨性别、同性婚姻等有社会争议的话题
- 宗教极端主义、民族分裂、种族主义相关内容
- 战争、军事冲突、武器扩散等敏感国际议题
- 其他可能引发政治或社会争议、不符合中国大陆主流价值观的话题

【极其重要】你必须严格、精确地按以下JSON格式返回，字段名一字不差，不要添加任何其他文字、不要添加markdown代码块标记、不要添加解释说明：
{"title_cn":"中文标题","summary_cn":"中文摘要","category":"分类名称","relevance_score":7,"is_selected":false,"commentary":"行业解读"}
字段说明：title_cn(中文标题)、summary_cn(中文摘要)、category(必须从7个分类中选)、relevance_score(0-10数字)、is_selected(true/false, score>=8时为true)、commentary(20字以内解读)`

const CATEGORIES = ['新作发布', 'IP/品牌/授权', '潮玩谷子', '影视综艺', '展会活动', '文旅及商品', '待分类']

function extractJson(raw) {
  const startIdx = raw.indexOf('{')
  const endIdx = raw.lastIndexOf('}')
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null
  try { return JSON.parse(raw.slice(startIdx, endIdx + 1)) } catch { return null }
}

async function callLLM(title) {
  if (!LLM_BASE_URL || !LLM_API_KEY) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': LLM_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: LLM_MODEL, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: `标题: ${title}` }], temperature: 0.2, max_tokens: 500 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) { log(`  LLM 错误 ${res.status}`); return null }
    const data = await res.json()
    const raw = data.content?.[0]?.text ?? ''
    const parsed = extractJson(raw)
    if (!parsed) { log(`  LLM 返回无法解析`); return null }
    return parsed
  } catch (e) {
    clearTimeout(timer)
    log(`  LLM 异常: ${e.message}`)
    return null
  }
}

async function processWithLLM(article) {
  const parsed = await callLLM(article.title)
  if (!parsed) return null
  const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类'
  const score = Math.min(10, Math.max(0, Number(parsed.relevance_score) || 5))
  return {
    title_cn: String(parsed.title_cn || article.title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score: score,
    is_selected: score >= 8,
    commentary: String(parsed.commentary || '').replace(/[\s—–-]{0,3}贾田点评$/g, '').replace(/[\s—–-]{0,3}推荐理由$/g, '').slice(0, 100),
  }
}

async function insertSupabase(articles, source) {
  if (!articles.length) return 0
  const seen = new Set()
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
  let inserted = 0
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10).map(a => {
      const row = { source, url: a.url, title: a.title, published_at: a.published_at || null }
      if (a.title_cn) {
        row.title_cn = a.title_cn
        row.summary_cn = a.summary_cn
        row.category = a.category
        row.relevance_score = a.relevance_score
        row.is_selected = a.is_selected
        row.commentary = a.commentary
      }
      return row
    })
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch),
      })
      if (res.ok) {
        const data = await res.json().catch(() => [])
        inserted += Array.isArray(data) ? data.length : 0
      } else {
        const errText = await res.text().catch(() => '')
        log(`  入库失败 HTTP ${res.status}: ${errText.slice(0, 200)}`)
      }
    } catch (e) { log(`  upsert error: ${e.message}`) }
  }
  return inserted
}

// ============ 主流程 ============
async function main() {
  const parser = new Parser()
  const results = { success: [], failed: [] }
  let totalInserted = 0
  let totalFiltered = 0

  for (const src of rssSources) {
    log(`\n测试: ${src.name} (${src.url})`)
    let feed
    try {
      feed = await parser.parseURL(src.url)
    } catch (e) {
      log(`  RSS解析失败: ${e.message}`)
      results.failed.push({ ...src, error: e.message })
      continue
    }

    const items = (feed.items || [])
      .filter(i => i.title && i.link)
      .slice(0, 5)
      .map(i => ({
        title: i.title,
        url: i.link,
        published_at: i.isoDate || null
      }))

    if (items.length === 0) {
      log(`  无有效条目`)
      results.failed.push({ ...src, error: '无有效条目' })
      continue
    }
    log(`  提取: ${items.length} 条`)

    // LLM处理
    const processed = []
    for (let i = 0; i < items.length; i += 3) {
      const batch = items.slice(i, i + 3)
      const batchResults = await Promise.all(batch.map(a => processWithLLM(a)))
      for (let j = 0; j < batch.length; j++) {
        const llm = batchResults[j]
        if (!llm) {
          processed.push(batch[j])
        } else if (llm.relevance_score < 4) {
          log(`  过滤低分: ${batch[j].title.slice(0, 30)} (score=${llm.relevance_score})`)
          totalFiltered++
        } else {
          processed.push({ ...batch[j], ...llm })
        }
      }
    }

    const n = await insertSupabase(processed, src.name)
    log(`  入库: ${n} 条`)
    totalInserted += n
    results.success.push({ ...src, fetched: items.length, inserted: n })
  }

  log(`\n========== RSS批量完成 ==========`)
  log(`成功: ${results.success.length} 个源`)
  log(`失败: ${results.failed.length} 个源`)
  log(`总入库: ${totalInserted} 条, 过滤: ${totalFiltered} 条`)

  writeFileSync(resolve(process.cwd(), 'scripts/bulk-rss-results.json'), JSON.stringify(results, null, 2), 'utf-8')
  log('结果已保存到 scripts/bulk-rss-results.json')
}

main().catch(e => { log('异常: ' + e.message); process.exit(1) })
