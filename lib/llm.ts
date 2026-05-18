// lib/llm.ts — 调用超级斜杠(ricoxueai) API 生成中文摘要与分类
// OpenAI 兼容格式

const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-5-mini'

export const CATEGORIES = [
  '新作发布',
  'IP授权',
  '潮玩谷子',
  '产业动态',
  '展会活动',
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

const SYSTEM_PROMPT = `你是一位动漫IP/ACG/文创行业的新闻编辑。请对以下英文新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/授权/商业角度
3. 从以下5个分类中选一个最贴切的：新作发布、IP授权、潮玩谷子、产业动态、展会活动
4. 给出0-10的相关性评分（该新闻对IP/ACG商业决策的价值，8分以上为高价值）\n   注意：如果是传统影视、纪录片、独立电影、真人剧集类新闻，评分应 ≤5，不入选\n   只保留与动漫IP、ACG、潮玩、文创授权、游戏、虚拟偶像、二次元衍生直接相关的内容\n5. 如果相关性评分 >= 8，标记为精选
6. 用一句话给出你的行业解读（犀利、有洞察、带观点，20字以内），不要加署名

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
          { role: 'system', content: SYSTEM_PROMPT },
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
      : '产业动态'

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
