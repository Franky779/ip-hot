export type SearchTextPart = {
  text: string
  highlighted: boolean
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createArticleSearchPattern(query: string): string | null {
  const keyword = query.trim()
  if (!keyword) return null
  return `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
}

export function splitSearchMatches(text: string, query: string): SearchTextPart[] {
  const keyword = query.trim()
  if (!keyword) return [{ text, highlighted: false }]

  const expression = new RegExp(escapeRegularExpression(keyword), 'gi')
  const parts: SearchTextPart[] = []
  let cursor = 0

  for (const match of text.matchAll(expression)) {
    if (match.index > cursor) {
      parts.push({ text: text.slice(cursor, match.index), highlighted: false })
    }
    parts.push({ text: match[0], highlighted: true })
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlighted: false })
  }
  return parts.length > 0 ? parts : [{ text, highlighted: false }]
}
