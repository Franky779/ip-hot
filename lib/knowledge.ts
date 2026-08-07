import knowledgeTerms from '@/data/knowledge-terms.json'

export interface KnowledgeTerm {
  id: string
  category: string
  term: string
  definition: string
  example?: string
  sourceChapter?: string
}

export function getAllKnowledgeTerms(): KnowledgeTerm[] {
  return knowledgeTerms as KnowledgeTerm[]
}

export function getKnowledgeTermsByCategory(): Map<string, KnowledgeTerm[]> {
  const map = new Map<string, KnowledgeTerm[]>()
  for (const term of knowledgeTerms as KnowledgeTerm[]) {
    const list = map.get(term.category) ?? []
    list.push(term)
    map.set(term.category, list)
  }
  return map
}

export function searchKnowledgeTerms(query: string): KnowledgeTerm[] {
  const q = query.toLowerCase()
  return (knowledgeTerms as KnowledgeTerm[]).filter(
    (t) =>
      t.term.toLowerCase().includes(q) ||
      t.definition.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
  )
}
