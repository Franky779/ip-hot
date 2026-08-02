import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSelectionThreshold, normalizeSelectionThreshold, SELECTION_THRESHOLD_KEY } from '@/lib/selection-threshold'

export const dynamic = 'force-dynamic'

function isAdmin(request: Request): boolean {
  return request.headers.get('x-admin-password') === process.env.ADMIN_PASSWORD
}

export async function GET(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ value: await getSelectionThreshold(createServiceClient()) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const value = normalizeSelectionThreshold((await request.json())?.value)
    const { error } = await createServiceClient().from('app_settings').upsert(
      { key: SELECTION_THRESHOLD_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ value })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
