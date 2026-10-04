// lib/events/gate-rules.ts — 热点榜闸门的纯逻辑（可独立单测）
//
// 为什么要单独拆一个文件（沿用 period-utils 的做法）：
// industry-gate.ts 需要 createServiceClient 与 callLlmJson，
// 而 node --experimental-strip-types 解析 next/server 会失败——
// 测试文件一旦间接 import 到数据库模块，整个测试套件就跑不起来。
// 判定规则是这里最该被测的部分（它直接决定榜单质量），必须能独立验证。

/**
 * 栏目化 / 汇总类内容：确定性预过滤，不花钱。
 *
 * 覆盖写法要宽：媒体编排这类标题的花样很多（本月推荐 / 每周推荐 /
 * 值得关注的 N 件 / 一周回顾 / 早报速览…）。漏掉一种就等于让一条
 * 媒体自己的汇总稿混进榜单——它永远不是行业事件，但看起来很像新闻。
 */
export const COLUMN_PATTERN =
  /(每周推荐|每月推荐|本周推荐|今日推荐|日推荐|每期推荐|推荐一期|每周一推|值得.{0,2}看|值得关注|大家都在看|大家都在玩|大家都在聊|本周.{0,4}精选|本月.{0,4}精选|月度盘点|一周回顾|本周.{0,2}汇总|本周盘点|新闻速览|快讯汇总|日报速览|早报|晚报|今日头条|十大|盘点|合集)/

/** 强授权信号：命中即直接判 relevant，省掉一次模型调用 */
export const STRONG_SIGNAL_PATTERN =
  /(授权合作|品牌联名|联名|授权协议|版权交易|IP授权|授权展|授权业务|被授权|授权方|联名款|跨界联名|授权活动|授权发行|授权金|权利金|分成协议|维权|侵权诉讼|商标侵权|著作权诉讼)/i

export type GateVerdict = {
  relevant: boolean
  reason: string
}

/**
 * 确定性预判：能直接定案的走这里，省一次 LLM 调用。
 * 返回 null 表示「要问模型」。
 *
 * 判定顺序有讲究：栏目化先判。「每周推荐」这类内容里也可能出现
 * 「联名」二字，先判信号会把它误放行。
 */
export function prefilterGate(title: string, summary: string | null): GateVerdict | null {
  const text = `${title} ${summary ?? ''}`

  if (COLUMN_PATTERN.test(text)) {
    return { relevant: false, reason: '栏目化汇总内容，非行业事件' }
  }
  if (STRONG_SIGNAL_PATTERN.test(text)) {
    return { relevant: true, reason: '含明确授权/联名/版权信号' }
  }
  return null
}

/**
 * 标题归一化：只保留中日韩字符与字母数字，用于判两个事件是不是同一件事。
 *
 * 为什么需要：聚簇是「每篇文章独立判断」的，标题写法不同的同一件事
 * （「某品牌联名官宣」vs「官宣！某品牌联名」）可能落进两个事件，
 * 榜单上就并排出现两条内容相近的（第 4、5 项重复）。
 * 聚簇层已有置信度门槛，这里是**展示层兜底**。
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '')
}

/**
 * 榜单去重：同一 normalized 标题只保留第一条（调用方按热度倒序传入）。
 *
 * 注意空标题的处理：归一化后为空的事件**要保留**，不能丢。
 * 早期版本用 `if (!key || seen.has(key)) continue`，
 * 结果标题为空的事件被整体踢出榜单——去重是为了去掉重复项，
 * 不是为了过滤内容，语义完全不是一回事。
 */
export function dedupeByTitle<T extends { title_cn: string | null; canonical_title: string }>(
  events: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const ev of events) {
    const key = normalizeTitle(ev.title_cn ?? ev.canonical_title)
    // 无标题可归一化 → 无法判重，原样保留
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(ev)
  }
  return out
}
