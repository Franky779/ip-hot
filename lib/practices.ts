import industryPractices from '@/data/industry-practices.json'

export interface IndustryPractice {
  id: string
  title: string
  type: string
  category: string
  steps?: string[]
  keyRules?: string[]
  description?: string
  sourceChapter?: string
}

export function getAllPractices(): IndustryPractice[] {
  return industryPractices as IndustryPractice[]
}

export function getPracticesByCategory(): Map<string, IndustryPractice[]> {
  const map = new Map<string, IndustryPractice[]>()
  for (const practice of industryPractices as IndustryPractice[]) {
    const list = map.get(practice.category) ?? []
    list.push(practice)
    map.set(practice.category, list)
  }
  return map
}

export function searchPractices(query: string): IndustryPractice[] {
  const q = query.toLowerCase()
  return (industryPractices as IndustryPractice[]).filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q) ||
      (p.steps && p.steps.some((s) => s.toLowerCase().includes(q))) ||
      (p.keyRules && p.keyRules.some((r) => r.toLowerCase().includes(q)))
  )
}
