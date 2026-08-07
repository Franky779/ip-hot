import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase'
import { validateFeedbackInput } from '@/lib/site-pages'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const result = validateFeedbackInput(await request.json())
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  const { error } = await createServiceClient().from('feedback').insert(result.value)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await createServiceClient().from('feedback').select('id, content, wechat, image, created_at').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feedback: data ?? [] })
}
