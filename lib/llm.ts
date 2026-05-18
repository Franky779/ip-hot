// lib/llm.ts — 调用超级斜杠(ricoxueai) API 生成中文摘要与分类
// OpenAI 兼容格式

import { createServiceClient } from './supabase'
import { findRelevantLearnings, formatLearningRules } from './classification-learning'

const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-5-mini'

export const CATEGORIES = [
  '新作发布',
  'IP授权',
  '潮玩谷子',
  '影视综艺',
  '展会活动',
  '文旅及商品',
  '待分类',
] as const

export type Category = (typeof CATEGORIES)[number]

export type LlmResult = {
  title_cn: string
  summary_cn: string
  category: Category
  relevance_score: number
  is_selected: boolean
  commentary: string
}

const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下7个分类中选一个最贴切的：
   - 新作发布：动漫/游戏/IP的新作品、新动画、新游戏发布
   - IP授权：IP授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态。重点品牌包括：泡泡玛特、寻找独角兽、TNT SPACE、52toys、玩乐主义、JPTOYS、奇梦岛、TOP TOY、布鲁可、卡游、若来、酷彼伴、19八3、奥飞娱乐、万代、森宝积木、摩点、潮玩族、千岛、X11
   - 影视综艺：动漫改编电影/剧集、游戏改编影视、漫画改编影视、IP衍生影视内容、虚拟偶像综艺
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化。重点渠道包括：名创优品、酷乐潮玩、三福、九木杂物社、TOP TOY、X11、The Green Party、伶俐、酷玩星球等IP衍生品零售连锁
   - 待分类：无法明确归入以上6类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分：
   - 9-10 核心命中：直接涉及动漫/漫画/游戏/IP授权/潮玩谷子/文创衍生/文旅/博物馆/旅游纪念品/城市IP/数字创意产业
   - 7-8  强相关：含IP/动漫/潮玩/文旅元素的新闻、IP联动、跨界合作、数字创意产业政策
   - 5-6  中度相关：科技/商业新闻里含IP/动漫/潮玩/文旅元素（如某科技公司收购漫画版权、文旅集团数字化）
   - 0-4  弱相关或无关：纯原创真人剧集、纪录片、人物传记片、传统好莱坞商业片、与上述产业无关的纯科技/财经/政策新闻
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

注意：
- 如果内容无法明确归入"新作发布/IP授权/潮玩谷子/影视综艺/展会活动/文旅及商品"这6类，请选择"待分类"。
- 如果内容涉及上述【特别约束】中的任何一类，必须选择"待分类"，评分可保留原值作为参考，但 category 必须是"待分类"。

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`

export async function summarizeArticle(
  title: string,
  content: string
): Promise<LlmResult | null> {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    console.warn('[LLM] 未配置 LLM_BASE_URL 或 LLM_API_KEY，跳过摘要')
    return null
  }

  // 查询学习记录并注入 prompt
  let systemPrompt = SYSTEM_PROMPT
  try {
    if (process.env.SUPABASE_SECRET_KEY) {
      const supabase = createServiceClient()
      const learnings = await findRelevantLearnings(supabase, title, 15)
      const learningRules = formatLearningRules(learnings)
      if (learningRules) {
        systemPrompt += learningRules
      }
    }
  } catch (e) {
    console.error('[LLM] 查询学习记录失败:', e instanceof Error ? e.message : String(e))
  }

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[LLM] API 错误:', res.status, text)
      return null
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''
    if (!raw) return null

    const jsonMatch = raw.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      console.warn('[LLM] 返回内容未包含 JSON:', raw.slice(0, 200))
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    const category = CATEGORIES.includes(parsed.category)
      ? (parsed.category as Category)
      : '待分类'

    const relevance_score = Math.min(
      10,
      Math.max(0, Number(parsed.relevance_score) || 5)
    )

    return {
      title_cn: String(parsed.title_cn || title).slice(0, 100),
      summary_cn: String(parsed.summary_cn || '').slice(0, 200),
      category,
      relevance_score,
      is_selected: relevance_score >= 8,
      commentary: String(parsed.commentary || '')
        .replace(/[\s—–-]{0,3}贾田点评$/g, '')
        .replace(/[\s—–-]{0,3}推荐理由$/g, '')
        .slice(0, 100),
    }
  } catch (e) {
    console.error('[LLM] 摘要失败:', e instanceof Error ? e.message : String(e))
    return null
  }
}
