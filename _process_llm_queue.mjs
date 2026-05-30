// 本地批量LLM处理脚本 — 不受Vercel 60s限制
// 用法: node _process_llm_queue.mjs
// 每次处理50条，可以重复运行直到清空积压

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// 加载 .env.local
const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const LLM_BASE_URL = process.env.LLM_BASE_URL
const LLM_API_KEY = process.env.LLM_API_KEY
const LLM_MODEL = process.env.LLM_MODEL || 'kimi-for-coding'

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BATCH_SIZE = 200  // 每次处理50条

// LLM 分类（与 lib/llm.ts 同步）
const CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺',
  '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化',
  '政策规则', '版权保护', '待分类',
]

const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下12个分类中选一个最贴切的：
   - 创作/上新：动漫/IP的新作品、新动画、新角色、新PV发布、创作者动态、独立作品、同人创作、插画/美术新作
   - IP/品牌/授权：IP/品牌/授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态
   - 零售/渠道：IP衍生品零售渠道、线下门店扩张、渠道合作、新零售模式
   - 影视综艺：动漫改编电影/剧集、漫画改编影视、IP衍生影视内容、虚拟偶像综艺、影视IP联动
   - 游戏/体育：游戏新作发布、游戏IP联动、电竞赛事、游戏公司动态、体育IP化、体育明星联名、运动品牌合作
   - AI/新技术：AI+内容创作、AIGC、AI绘画/视频、虚拟人/数字人、数字藏品/NFT、Web3、元宇宙、XR/VR/AR
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化
   - 艺术/亚文化：当代艺术、涂鸦、街头文化、小众审美、亚文化社群、独立音乐/乐队、地下文化、实验艺术
   - 政策规则：动漫/文创/潮玩/文旅相关产业政策、行业法规、政府扶持计划、行业规范、市场准入、税收优惠、进出口政策
   - 版权保护：版权登记、维权诉讼、侵权打击、版权交易平台、IP版权纠纷、盗版治理、商标争议、知识产权保护
   - 待分类：无法明确归入以上12类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分（9-10核心命中 / 7-8强相关 / 5-6中度相关 / 0-4弱相关或无关：纯IPO/上市/融资/财报类财经新闻、纯原创真人剧集、传统好莱坞商业片、与上述产业无关的纯科技/财经/政策新闻）
5. 如果评分>=8，标记为精选
6. 一句话行业解读（犀利、有洞察，20字以内）

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`

async function summarizeArticle(title) {
  try {
    const res = await fetch(`${LLM_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LLM_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `标题: ${title}\n\n内容: ${title}` }],
        temperature: 0.2,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = await res.json()
    const raw = data.content?.[0]?.text ?? ''
    if (!raw) throw new Error('Empty response')

    const jsonMatch = raw.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类'
    const score = Math.min(10, Math.max(0, Number(parsed.relevance_score) || 5))

    return {
      title_cn: String(parsed.title_cn || title).slice(0, 100),
      summary_cn: String(parsed.summary_cn || '').slice(0, 200),
      category,
      relevance_score: score,
      is_selected: score >= 8,
      commentary: String(parsed.commentary || '').replace(/[\s—–-]{0,3}贾田点评$/g, '').slice(0, 100),
    }
  } catch (e) {
    console.error(`  LLM失败: ${e.message}`)
    return null
  }
}

async function main() {
  console.log(`模型: ${LLM_MODEL}`)
  console.log(`批次: ${BATCH_SIZE} 条\n`)

  // 查询待处理文章
  const { data: pending, error } = await supabase
    .from('articles')
    .select('id, title, source')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (error) { console.error('查询失败:', error.message); process.exit(1) }
  if (!pending?.length) { console.log('✅ 无待处理文章'); process.exit(0) }

  console.log(`待处理: ${pending.length} 条\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < pending.length; i++) {
    const article = pending[i]
    const tag = `[${i + 1}/${pending.length}]`

    try {
      const result = await summarizeArticle(article.title)

      if (!result) {
        // 失败降级：保留原标题
        const { error: upErr } = await supabase
          .from('articles')
          .update({ title_cn: article.title.slice(0, 60), summary_cn: '', category: '待分类', relevance_score: null, is_selected: false, commentary: null })
          .eq('id', article.id)

        console.log(`${tag} ⬇ ${article.title.slice(0, 50)}`)
        failed++
        continue
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

      if (upErr) {
        console.log(`${tag} ❌ 更新失败: ${upErr.message}`)
        failed++
      } else {
        const star = result.is_selected ? '⭐' : '  '
        console.log(`${tag} ${star} [${result.category}] ${result.title_cn.slice(0, 40)}`)
        success++
      }
    } catch (e) {
      console.log(`${tag} ❌ ${e.message}`)
      failed++
    }

    // LLM API 限速：每条间隔 1 秒
    if (i < pending.length - 1) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  // 统计剩余
  const { count: remaining } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .is('title_cn', null)

  console.log(`\n====================================`)
  console.log(`本次处理: ${pending.length} | 成功: ${success} | 失败: ${failed}`)
  console.log(`剩余积压: ${remaining ?? '?'} 条`)
  console.log(`====================================`)

  if (remaining > 0) {
    console.log(`\n还有 ${remaining} 条待处理，重新运行本脚本即可继续。`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
