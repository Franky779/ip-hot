// lib/llm.ts — LLM 调用模块
// 主力: Kimi K2.6 (kimi-for-coding)  via ccswith 路由 → https://api.kimi.com/coding
// 备份: DeepSeek V3 (deepseek-chat) via ccswith 路由 → https://api.deepseek.com/anthropic
// 协议: Anthropic Messages (/v1/messages)

import { createServiceClient } from './supabase'
import { findRelevantLearnings, formatLearningRules } from './classification-learning'

const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'kimi-for-coding'

// 备用 LLM
const BACKUP_URL = process.env.LLM_BACKUP_URL || ''
const BACKUP_KEY = process.env.LLM_BACKUP_KEY || ''
const BACKUP_MODEL = process.env.LLM_BACKUP_MODEL || 'deepseek-chat'

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
   - AI/新技术：AI+内容创作、AIGC、AI绘画/视频、虚拟人/数字人、数字藏品/NFT、Web3、元宇宙、XR/VR/AR、区块链应用、新技术在IP领域的创新应用
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化
   - 艺术/亚文化：当代艺术、涂鸦、街头文化、小众审美、亚文化社群、独立音乐/乐队、地下文化、实验艺术
   - 政策规则：动漫/文创/潮玩/文旅相关产业政策、行业法规、政府扶持计划、行业规范、市场准入、税收优惠、进出口政策
   - 版权保护：版权登记、维权诉讼、侵权打击、版权交易平台、IP版权纠纷、盗版治理、商标争议、知识产权保护
   - 待分类：无法明确归入以上12类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分：
   - 9-10 核心命中：直接涉及动漫/漫画/游戏/IP/品牌/授权/潮玩谷子/文创衍生/文旅/博物馆/旅游纪念品/城市IP/数字创意产业
   - 7-8  强相关：含IP/动漫/潮玩/文旅元素的新闻、IP联动、跨界合作、数字创意产业政策
   - 4-6  中度相关：科技/商业新闻里含IP/动漫/潮玩/文旅元素（如某科技公司收购漫画版权、文旅集团数字化）
   - 0-3  弱相关或无关：纯原创真人剧集、纪录片、人物传记片、传统好莱坞商业片、纯IPO/上市/融资/财报类财经新闻、与上述产业无关的纯科技/财经/政策新闻 → 评分0-3的文章会被自动删除
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
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw: string = data.content?.[0]?.text ?? ''
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

  const relevance_score = Math.min(
    10,
    Math.max(0, Number(parsed.relevance_score) || 5)
  )

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

  // 主力 Kimi 3次重试
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = await callLLM(title, content, systemPrompt, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)
      return parseResult(parsed, title)
    } catch (e) {
      console.warn(`[LLM] Kimi 第${i + 1}次失败:`, (e as Error).message?.slice(0, 80))
    }
    if (i < 2) await sleep(2000)
  }

  // 备用 DeepSeek 2次重试
  if (BACKUP_URL && BACKUP_KEY) {
    for (let i = 0; i < 2; i++) {
      try {
        const parsed = await callLLM(title, content, systemPrompt, BACKUP_URL, BACKUP_KEY, BACKUP_MODEL)
        return parseResult(parsed, title)
      } catch (e) {
        console.warn(`[LLM] DeepSeek 第${i + 1}次失败:`, (e as Error).message?.slice(0, 80))
      }
      if (i < 1) await sleep(2000)
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