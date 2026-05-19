import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { RSS_SOURCES } from '@/lib/sources'

export async function GET(request: Request) {
  const adminPw = request.headers.get('x-admin-password')
  if (!adminPw || adminPw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, any> = {}

  // 1. 检查 Supabase 连接
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('cron_logs').select('count').limit(1)
    results.supabase = error ? { ok: false, error: error.message } : { ok: true }
  } catch (e: any) {
    results.supabase = { ok: false, error: e.message }
  }

  // 2. 检查 RSS 源列表
  results.rssSources = RSS_SOURCES.map((s) => ({ name: s.name, url: s.url }))

  // 3. 检查环境变量
  results.env = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseSecret: !!process.env.SUPABASE_SECRET_KEY,
    hasCronSecret: !!process.env.CRON_SECRET,
    hasAdminPw: !!process.env.ADMIN_PASSWORD,
    hasLlmBaseUrl: !!process.env.LLM_BASE_URL,
    hasLlmKey: !!process.env.LLM_API_KEY,
  }

  return NextResponse.json({ ok: true, results })
}
