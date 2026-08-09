import { TalksPageClient } from '@/app/components/TalksPageClient'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { unstable_noStore as noStore } from 'next/cache'

export const metadata = { title: '专业知识 - IP 行业资讯快报', description: 'IP 行业专业用语、公众号文章、播客与课程' }
export const dynamic = 'force-dynamic'

function readJson(filename: string) {
  try {
    const filePath = join(process.cwd(), 'data', filename)
    if (!existsSync(filePath)) return []
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

export default function TalksPage() {
  noStore()
  const articles = readJson('talks-articles.json')
  const knowledge = readJson('knowledge-terms.json')
  const podcast = readJson('talks-podcast.json')
  const courses = readJson('talks-courses.json')

  return (
    <TalksPageClient
      articles={articles}
      knowledge={knowledge}
      podcast={podcast}
      courses={courses}
    />
  )
}
