// lib/current-affairs-filter.ts — 采集层时政/领导人新闻过滤
// 官方源（gov.cn 等政府域名）RSS 会混入与行业无关的领导人时政要闻，
// 这些标题送 LLM 会被网关以「sensitive words detected」拦截引发「三家全挂」误报。
// 这里在采集入库阶段直接丢弃官方源的领导人时政标题，不再进 LLM。
// 仅对政府域名生效，避免误伤普通媒体/行业源。

/** 中国政府官方域名后缀（匹配 hostname 末尾） */
const GOV_HOST_RE = /\.gov\.(cn|hk)$/i

const LEADER_TERMS = [
  '习近平',
  '国家主席',
  '国家副主席',
  '总书记',
  '国务院总理',
  '国务院副总理',
  '中央政治局',
  '中共中央',
  '党中央',
  '全国人大',
  '全国政协',
  '中央军委',
  '中纪委',
  '中央纪委',
]

/** 命中任一强政治词即判为领导人/时政新闻标题 */
const LEADER_TERM_RE = new RegExp(`(${LEADER_TERMS.join('|')})`)

/** 判断文章 URL 是否属于中国政府官方域名 */
export function isGovDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return GOV_HOST_RE.test(host)
  } catch {
    return false
  }
}

/** 判断官方源文章的标题是否属于当场时事/领导人新闻（应在采集层丢弃） */
export function isOfficialCurrentAffairs(title: string, url: string): boolean {
  if (!isGovDomain(url)) return false
  return LEADER_TERM_RE.test(title)
}