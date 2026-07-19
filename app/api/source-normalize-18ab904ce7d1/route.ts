import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const NORMALIZE_TOKEN = 'f113b4b1d17d4476b773a522957fa57d'

const UPDATES = [
  {
    name: '17173动漫',
    url: 'https://search.17173.com/?keyword=%E5%8A%A8%E6%BC%AB',
    method: '17173 第一方搜索 API',
  },
  {
    name: '雷报',
    url: 'https://www.jiemian.com/account/2079.html',
    method: '界面新闻已认证雷报账号 API',
  },
]

export async function POST(request: Request) {
  if (request.headers.get('x-source-normalize-token') !== NORMALIZE_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results = []
  for (const update of UPDATES) {
    const { data, error } = await supabase
      .from('info_sources')
      .update({ url: update.url, method: update.method, fetch_type: 'web' })
      .eq('name', update.name)
      .select('id, name, url, method, fetch_type, enabled, last_test_status')
      .single()
    results.push({ data, error: error?.message ?? null })
  }

  return NextResponse.json({ ok: results.every((result) => !result.error), results })
}
