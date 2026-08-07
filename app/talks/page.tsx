import { TalksPageClient } from '@/app/components/TalksPageClient'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const metadata = { title: '老贾有话说 - IP 行业资讯快报', description: '老贾关于 IP、授权与营销的观察与思考' }
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
