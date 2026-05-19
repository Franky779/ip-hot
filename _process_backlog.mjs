// 本地批量处理积压的新闻 + Token使用量统计
// 用法：node _process_backlog.mjs
// 需要 .env.local 里的 SUPABASE_SECRET_KEY + LLM_* 配置

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// 加载 .env.local
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim()]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY
const LLM_BASE_URL = env.LLM_BASE_URL
const LLM_API_KEY = env.LLM_API_KEY
const LLM_MODEL = env.LLM_MODEL || 'unknown'

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY')
  process.exit(1)
}
if (!LLM_BASE_URL || !LLM_API_KEY) {
  console.error('缺少 LLM_BASE_URL 或 LLM_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下7个分类中选一个最贴切的：
   - 新作发布：动漫/游戏/IP的新作品、新动画、新游戏发布
   - IP/品牌/授权：IP/品牌/授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态。重点品牌：泡泡玛特、寻找独角兽、TNT SPACE、52toys、玩乐主义、JPTOYS、奇梦岛、TOP TOY、布鲁可、卡游、若来、酷彼伴、19八3、奥飞娱乐、万代、森宝积木、摩点、潮玩族、千岛、X11
   - 影视综艺：动漫改编电影/剧集、游戏改编影视、漫画改编影视、IP衍生影视内容、虚拟偶像综艺
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化。重点渠道：名创优品、酷乐潮玩、三福、九木杂物社、TOP TOY、X11、The Green Party、伶俐、酷玩星球等IP衍生品零售连锁
   - 待分类：无法明确归入以上6类的资讯，等待人工复核
4. 给出0-10的产业匹配度评分：
   - 9-10 核心命中：直接涉及动漫/漫画/游戏/IP/品牌/授权/潮玩谷子/文创衍生/文旅/博物馆/旅游纪念品/城市IP/数字创意产业
   - 7-8  强相关：含IP/动漫/潮玩/文旅元素的新闻、IP联动、跨界合作、数字创意产业政策
   - 5-6  中度相关：科技/商业新闻里含IP/动漫/潮玩/文旅元素
   - 0-4  弱相关或无关：纯原创真人剧集、纪录片、人物传记片、传统好莱坞商业片、与上述产业无关的纯科技/财经/政策新闻
5. 如果产业匹配度评分 >= 8，标记为精选

注意：如果内容无法明确归入"新作发布/IP/品牌/授权/潮玩谷子/影视综艺/展会活动/文旅及商品"这6类，请务必选择"待分类"。

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true}`

const CATEGORIES = ['新作发布', 'IP/品牌/授权', '潮玩谷子', '影视综艺', '展会活动', '文旅及商品', '待分类']

// 返回 { result, usage }，usage = { prompt_tokens, completion_tokens, total_tokens }
async function summarizeOnce(title) {
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
      messages: [
        { role: 'user', content: `标题: ${title}` },
      ],
      max_tokens: 400,
    }),
  })

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  const data = await res.json()
  const usage = {
    prompt_tokens: data.usage?.input_tokens || 0,
    completion_tokens: data.usage?.output_tokens || 0,
    total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  }
  const raw = data.content?.[0]?.text ?? ''
  if (!raw) {
    throw new Error('API返回为空')
  }

  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) {
    throw new Error(`返回无JSON: ${raw.slice(0, 100)}`)
  }

  const parsed = JSON.parse(jsonMatch[0])
  const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类'
  const relevance_score = Math.min(10, Math.max(0, Number(parsed.relevance_score) || 5))

  return {
    result: {
      title_cn: String(parsed.title_cn || title).slice(0, 100),
      summary_cn: String(parsed.summary_cn || '').slice(0, 200),
      category,
      relevance_score,
      is_selected: relevance_score >= 7,
    },
    usage,
  }
}

// 带重试：最多 3 次尝试，间隔 3 秒
async function summarizeArticle(title) {
  let lastErr
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  let retries = 0
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { result, usage } = await summarizeOnce(title)
      totalUsage.prompt_tokens += usage.prompt_tokens
      totalUsage.completion_tokens += usage.completion_tokens
      totalUsage.total_tokens += usage.total_tokens
      return { result, usage: totalUsage, retries }
    } catch (e) {
      lastErr = e
      retries++
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }
  throw lastErr
}

async function main() {
  // 查 category 或 title_cn 任一为 null 的记录（降级遗留 + 完全未处理）
  console.log('1) 查询未处理的新闻（category IS NULL 或 title_cn IS NULL）...')
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title')
    .or('category.is.null,title_cn.is.null')
    .order('published_at', { ascending: false })

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  if (!articles || articles.length === 0) {
    console.log('没有待处理的新闻')
    process.exit(0)
  }

  console.log(`   共 ${articles.length} 条待处理`)
  console.log(`   模型: ${LLM_MODEL} | API: ${LLM_BASE_URL}`)
  console.log(`   策略: 单条间隔1秒 + 失败重试3次(间隔3秒)`)
  console.log()

  let success = 0
  let failed = 0
  let retryCount = 0
  let totalPrompt = 0
  let totalCompletion = 0
  let totalTokens = 0

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]
    const tag = `[${i + 1}/${articles.length}]`

    try {
      const { result, usage, retries } = await summarizeArticle(article.title)

      await supabase
        .from('articles')
        .update({
          title_cn: result.title_cn,
          summary_cn: result.summary_cn,
          category: result.category,
          relevance_score: result.relevance_score,
          is_selected: result.is_selected,
        })
        .eq('id', article.id)

      success++
      retryCount += retries
      totalPrompt += usage.prompt_tokens
      totalCompletion += usage.completion_tokens
      totalTokens += usage.total_tokens

      const flag = result.is_selected ? '⭐' : '  '
      const retryMark = retries > 0 ? `🔄${retries}` : '  '
      console.log(
        `${tag} ${flag}${retryMark} ${result.category}(${result.relevance_score}) ` +
        `| 输入${usage.prompt_tokens} 输出${usage.completion_tokens} ` +
        `| ${result.title_cn.slice(0, 35)}`
      )
    } catch (e) {
      failed++
      retryCount += 2
      console.error(`${tag} ❌ ${e.message.slice(0, 100)} | ${article.title.slice(0, 30)}`)
    }

    // 单条之间停 1 秒，给 API 喘息
    if (i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  console.log()
  console.log('====================================')
  console.log(`模型: ${LLM_MODEL}`)
  console.log(`成功: ${success} | 失败: ${failed} | 总计: ${articles.length}`)
  console.log(`重试次数: ${retryCount}`)
  console.log(`输入Token: ${totalPrompt}`)
  console.log(`输出Token: ${totalCompletion}`)
  console.log(`总Token:  ${totalTokens}`)
  console.log('====================================')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
