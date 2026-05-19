import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-admin-password')
    if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('cron_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: data })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron-logs] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
