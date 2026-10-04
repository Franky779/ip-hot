import { TalksPageClient } from '@/app/components/TalksPageClient'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { unstable_noStore as noStore } from 'next/cache'

export const metadata = { title: '专业知识 - IP 行业资讯快报', description: 'IP 行业专业用语、播客与线上课程' }
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
  // 2026-10-04 移除 talks-articles.json（公众号文章分类已下线）
  const knowledge = readJson('knowledge-terms.json')
  const podcast = readJson('talks-podcast.json')
  const courses = readJson('talks-courses.json')

  return (
    <TalksPageClient
      knowledge={knowledge}
      podcast={podcast}
      courses={courses}
    />
  )
}
