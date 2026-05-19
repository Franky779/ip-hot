// 分类学习系统：提取关键词、查询学习记录、注入 LLM prompt

import { SupabaseClient } from '@supabase/supabase-js'

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '又', '与', '及',
  '等', '以', '为', '之', '而', '或', '但', '从', '将', '被', '把', '向', '于', '对', '给', '让',
  '比', '当', '还', '只', '最', '更', '太', '非常', '已经', '现在', '今天', '今年', '公司', '品牌',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'or', 'but', 'if', 'then',
  'else', 'because', 'until', 'while', 'about', 'against', 'up', 'down', 'out', 'off', 'over',
])

/** 从标题中提取关键词（用于学习记录匹配） */
export function extractKeywords(title: string): string[] {
  const keywords: string[] = []

  // 中文：提取2-6字的连续中文字符
  const chineseMatches = title.match(/[一-龥]{2,6}/g) || []
  for (const word of chineseMatches) {
    if (!STOP_WORDS.has(word)) {
      keywords.push(word)
    }
  }

  // 英文：提取2+字母的单词
  const englishMatches = title.match(/[a-zA-Z]{2,}/g) || []
  for (const word of englishMatches) {
    const lower = word.toLowerCase()
    if (!STOP_WORDS.has(lower)) {
      keywords.push(lower)
    }
  }

  return [...new Set(keywords)].slice(0, 20)
}

/** 查询与当前标题相关的学习记录 */
export async function findRelevantLearnings(
  supabase: SupabaseClient,
  title: string,
  limit: number = 8
): Promise<Array<{ original_title: string; corrected_category: string; match_count: number }>> {
  const keywords = extractKeywords(title)

  if (keywords.length === 0) {
    return []
  }

  // 用关键词数组交集匹配：找到 title_keywords 与当前标题关键词有重叠的学习记录
  const { data, error } = await supabase
    .from('classification_learnings')
    .select('original_title, corrected_category, match_count')
    .eq('is_active', true)
    .overlaps('title_keywords', keywords)
    .order('match_count', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[Learning] 查询学习记录失败:', error.message)
    return []
  }

  return (data ?? []) as Array<{ original_title: string; corrected_category: string; match_count: number }>
}

/** 将学习记录格式化为 LLM prompt 追加内容 */
export function formatLearningRules(
  learnings: Array<{ original_title: string; corrected_category: string; match_count: number }>
): string {
  if (learnings.length === 0) return ''

  const lines = learnings
    .map(
      (l) =>
        `  - "${l.original_title.slice(0, 50)}" → ${l.corrected_category} (被确认${l.match_count}次)`
    )
    .join('\n')

  return `\n\n【历史学习规则】以下是管理员人工确认过的分类案例，请作为参考优先遵循（尤其当标题关键词与以下案例相似时）：\n${lines}\n`
}
