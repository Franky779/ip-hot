import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

function getDataDir() {
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function readJsonFile(filename: string) {
  const filePath = join(getDataDir(), filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function writeJsonFile(filename: string, data: unknown) {
  const filePath = join(getDataDir(), filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const SECTION_FILES: Record<string, string> = {
  articles: 'talks-articles.json',
  knowledge: 'knowledge-terms.json',
  podcast: 'talks-podcast.json',
  courses: 'talks-courses.json',
}

export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get('section')
  if (!section || !SECTION_FILES[section]) {
    return NextResponse.json({ error: 'Invalid section. Use: articles, knowledge, podcast, courses' }, { status: 400 })
  }
  const data = readJsonFile(SECTION_FILES[section])
  return NextResponse.json(data ?? [])
}

export async function PUT(request: NextRequest) {
  const section = request.nextUrl.searchParams.get('section')
  if (!section || !SECTION_FILES[section]) {
    return NextResponse.json({ error: 'Invalid section. Use: articles, knowledge, podcast, courses' }, { status: 400 })
  }
  try {
    const body = await request.json()
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be an array' }, { status: 400 })
    }
    writeJsonFile(SECTION_FILES[section], body)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
