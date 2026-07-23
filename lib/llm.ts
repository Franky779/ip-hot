// lib/llm.ts — LLM 调用模块
// 调用顺序: DeepSeek V4 Flash → Kimi K2.6 → Kimi for Coding
// 三个服务均使用各自的 OpenAI 兼容接口。

import { createServiceClient } from './supabase'
import { findRelevantLearnings, formatLearningRules } from './classification-learning'
import { enforceDirectIndustryScore, INDUSTRY_SCOPE_RULES } from './relevance'

type LlmProvider = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  attempts: number
}

const LLM_PROVIDERS: LlmProvider[] = [
  {
    name: 'DeepSeek',
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    attempts: 3,
  },
  {
    name: 'Kimi',
    baseUrl: process.env.LLM_BACKUP_URL || '',
    apiKey: process.env.LLM_BACKUP_KEY || '',
    model: process.env.LLM_BACKUP_MODEL || 'kimi-k2.6',
    attempts: 2,
  },
  {
    name: 'Kimi Coding',
    baseUrl: process.env.LLM_BACKUP2_URL || '',
    apiKey: process.env.LLM_BACKUP2_KEY || '',
    model: process.env.LLM_BACKUP2_MODEL || 'kimi-for-coding',
    attempts: 2,
  },
]

export const CATEGORIES = [
  '创作/上新',
  'IP/品牌/授权',
  '潮玩谷子',
  '零售/渠道',
  '影视综艺',
  '游戏/体育',
  'AI/新技术',
  '展会活动',
  '文旅及商品',
  '艺术/亚文化',
  '政策规则',
  '版权保护',
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

${INDUSTRY_SCOPE_RULES}

【最高优先级：直接行业相关性门槛】
只有新闻的核心事件、核心产品、交易对象或主要参与者直接属于以下目标行业，才允许评分达到7分：
- 文创、动漫IP、影视IP、游戏IP、文学IP、传统文化IP、文旅IP、体育IP、艺术家IP、明星/虚拟角色IP、企业品牌IP的开发与运营
- IP授权、品牌授权、版权交易、内容改编、授权代理、品牌联名、联合营销、商品化开发
- 潮玩、谷子、手办、卡牌、玩具及其零售渠道
- IP衍生消费品、体验型授权与数字型授权业务
- 文创商品、博物馆文创、文化遗产活化、文旅项目、主题乐园、商业空间、城市IP、旅游纪念品
- 上述行业的展会、政策、版权保护及明确落地的新技术应用

不能因为一条泛科技、泛AI、泛财经、泛消费或泛政策新闻“可能影响”“可以用于”“值得关注”目标行业，就把它判为直接相关。禁止从无关新闻中强行提炼IP、文旅或商业角度。

AI/新技术必须同时出现明确的目标行业对象和具体应用案例，例如AI用于某动画制作、某IP运营、某博物馆项目或某文旅产品。通用大模型发布、AI公司融资、芯片算力、智能体、办公提效、AI政策伦理、泛AIGC工具等，即使可能影响内容行业，也属于间接相关，最高3分。

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下12个分类中选一个最贴切的：
   - 创作/上新：动漫/IP的新作品、新动画、新角色、新PV发布、创作者动态、独立作品、同人创作、插画/美术新作
   - IP/品牌/授权：IP/品牌/授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态。重点品牌包括：泡泡玛特、寻找独角兽、TNT SPACE、52toys、玩乐主义、JPTOYS、奇梦岛、TOP TOY、布鲁可、卡游、若来、酷彼伴、19八3、奥飞娱乐、万代、森宝积木、摩点、潮玩族、千岛、X11
   - 零售/渠道：IP衍生品零售渠道、线下门店扩张、渠道合作、新零售模式、便利店/商超/餐饮IP联名。重点渠道包括：名创优品、酷乐潮玩、三福、九木杂物社、TOP TOY、X11、The Green Party、伶俐、酷玩星球、沃尔玛、全家、罗森、7-Eleven等
   - 影视综艺：动漫改编电影/剧集、漫画改编影视、IP衍生影视内容、虚拟偶像综艺、影视IP联动
   - 游戏/体育：游戏新作发布、游戏IP联动、电竞赛事、游戏公司动态、体育IP化、体育明星联名、运动品牌合作、体育赛事周边
   - AI/新技术：新技术在动漫、IP、授权、潮玩、文创、博物馆或文旅项目中的明确落地应用；不得收录没有具体目标行业对象的泛AI资讯
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化
   - 艺术/亚文化：当代艺术、涂鸦、街头文化、小众审美、亚文化社群、独立音乐/乐队、地下文化、实验艺术
   - 政策规则：动漫/文创/潮玩/文旅相关产业政策、行业法规、政府扶持计划、行业规范、市场准入、税收优惠、进出口政策
   - 版权保护：版权登记、维权诉讼、侵权打击、版权交易平台、IP版权纠纷、盗版治理、商标争议、知识产权保护
   - 待分类：无法明确归入以上12类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分：
   - 9-10 核心命中：新闻主体和核心事件都直接属于目标行业，并具有明确业务信息或行业价值
   - 7-8  直接相关：核心事件至少明确涉及一个目标行业对象、产品、项目、合作、交易或政策
   - 4-6  边界待审：提到目标行业，但核心事件是否直接相关仍不明确；不会进入公开资讯流
   - 0-3  间接相关或无关：只是可能影响目标行业、可被目标行业采用，或属于泛AI/科技/财经/消费/政策资讯；纯原创真人剧集、纪录片、人物传记片、传统好莱坞商业片、纯IPO/融资/财报也在此列
   - ⚠️ 如果内容与动漫/IP/潮玩/文创/文旅/博物馆/数字创意产业完全无关，评分直接给0
5. 精选标记规则：评分 >= 7 标记为精选（is_selected = true）
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
- 如果内容无法明确归入前12类，请选择"待分类"
- 如果内容涉及上述【特别约束】中的任何一类，必须选择"待分类"
- 评分0-3的文章会被系统自动删除，请谨慎评分

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`

/** 调用单个 LLM API */
async function callLLM(
  title: string,
  content: string,
  systemPrompt: string,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<LlmResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  let res: Response
  try {
    res = await fetch(endpoint, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''
  if (!raw) throw new Error('Empty response')

  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) throw new Error(`No JSON in: ${raw.slice(0, 120)}`)

  return JSON.parse(jsonMatch[0])
}

/** 解析 LLM 返回的 JSON 为标准结果 */
function parseResult(parsed: Record<string, unknown>, title: string): LlmResult {
  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : '待分类'

  const parsedScore = Number(parsed.relevance_score)
  const modelScore = Number.isFinite(parsedScore)
    ? Math.min(10, Math.max(0, parsedScore))
    : 5
  const relevance_score = enforceDirectIndustryScore(title, category, modelScore)

  return {
    title_cn: String(parsed.title_cn || title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score,
    is_selected: relevance_score >= 7,
    commentary: String(parsed.commentary || '待人工编辑')
      .replace(/[\s—–-]{0,3}(贾田点评|推荐理由|编辑推荐).*$/g, '')
      .replace(/^[\s—–-]+|[\s—–-]+$/g, '')
      .slice(0, 100),
  }
}

/** 检测 commentary 是否明确表示与产业完全无关 */
export function isIrrelevantByCommentary(commentary: string | null): boolean {
  if (!commentary || commentary === '待人工编辑') return false
  // 匹配模式：完全无关 / 与XX无关 / 无关产业 / 建议不收录
  return /完全无关|与[一-龥\/]{1,20}无关|无关产业|建议不收录|不建议收录/.test(commentary)
}

/** 统一判断文章是否应被忽略（低分或 commentary 明确无关） */
export function shouldIgnoreArticle(
  relevanceScore: number | null,
  commentary: string | null
): boolean {
  // LLM 已判定弱相关/无关（prompt 要求 0-3 分自动删除）
  if ((relevanceScore ?? 10) <= 3) return true
  // commentary 明确表达无关
  return isIrrelevantByCommentary(commentary)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function summarizeArticle(
  title: string,
  content: string
): Promise<LlmResult | null> {
  const providers = LLM_PROVIDERS.filter(
    (provider) => provider.baseUrl && provider.apiKey && provider.model
  )
  if (!providers.length) {
    console.warn('[LLM] 未配置可用的 LLM，跳过摘要')
    return null
  }

  // 查询学习记录并注入 prompt
  let systemPrompt = SYSTEM_PROMPT
  try {
    if (process.env.DATABASE_URL) {
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

  for (const provider of providers) {
    for (let i = 0; i < provider.attempts; i++) {
      try {
        const parsed = await callLLM(
          title,
          content,
          systemPrompt,
          provider.baseUrl,
          provider.apiKey,
          provider.model
        )
        return parseResult(parsed, title)
      } catch (e) {
        console.warn(
          `[LLM] ${provider.name} 第${i + 1}次失败:`,
          (e as Error).message?.slice(0, 160)
        )
      }
      if (i < provider.attempts - 1) await sleep(2000)
    }
  }

  // 全部失败，返回降级结果（不返回 null）
  console.error('[LLM] 所有模型均失败，返回降级结果')
  return {
    title_cn: title.slice(0, 60),
    summary_cn: '',
    category: '待分类',
    relevance_score: 5,
    is_selected: false,
    commentary: '待人工编辑',
  }
}
