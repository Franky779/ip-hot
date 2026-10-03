// lib/events/tokenize.ts — 标题确定性特征提取（无向量、零模型成本）
// 用途：事件聚簇第一步「候选召回」。同一实体的报道会共享品牌名/人名等特征。

const LATIN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'new', 'from', 'that', 'this', 'are', 'was',
  'www', 'com', 'http', 'https', 'out', 'off', 'via', 'all', 'top', 'big',
  'news', 'video', 'watch', 'official', 'japan', 'china', 'chinese',
])

/** 提取标题的确定性问题特征：拉丁词（含数字）+ 中文相邻二字组 */
export function extractFeatures(title: string): Set<string> {
  const features = new Set<string>()
  if (!title) return features

  // 拉丁词与数字：2026、50周年、PEZ、gundam
  const latinMatches = title.toLowerCase().match(/[a-z0-9][a-z0-9&.'-]{1,}/g) ?? []
  for (const raw of latinMatches) {
    const word = raw.replace(/[.&'-]+$/, '')
    if (word.length >= 2 && word.length <= 30 && !LATIN_STOPWORDS.has(word)) {
      features.add(`l:${word}`)
    }
  }

  // 中文：滑窗二字组（品牌名/人名/作品名会稳定命中同一组 bigram）
  const cjkRuns = title.match(/[一-鿿]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i + 2 <= run.length; i++) {
      features.add(`c:${run.slice(i, i + 2)}`)
    }
  }

  return features
}

/** 两个标题的共享特征数（召回门槛：>=2 即候选） */
export function featureOverlap(a: string, b: string): number {
  const fa = extractFeatures(a)
  const fb = extractFeatures(b)
  if (fa.size === 0 || fb.size === 0) return 0
  const [small, large] = fa.size <= fb.size ? [fa, fb] : [fb, fa]
  let shared = 0
  for (const f of small) if (large.has(f)) shared++
  return shared
}

/** best-effort 抽主体实体：标题里最长的拉丁词（通常是品牌/IP 名），中文标题留空 */
export function extractPrimaryEntity(title: string): string | null {
  const latinMatches = title.match(/[A-Za-z0-9][A-Za-z0-9&.'-]{1,}/g) ?? []
  const candidates = latinMatches
    .map((w) => w.replace(/[.'&-]+$/, ''))
    .filter((w) => w.length >= 2 && w.length <= 30 && !LATIN_STOPWORDS.has(w.toLowerCase()))
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => b.length - a.length)[0]
}
