import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function verifyAdmin(request: Request): boolean {
  const authHeader = request.headers.get('x-admin-password')
  return !!authHeader && authHeader === process.env.ADMIN_PASSWORD
}

export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { section_id, section_title, region, name, url, type, description, method, sort_order } = body

  if (!section_id || !section_title || !region || !name || !url || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('info_sources')
    .insert({
      section_id,
      section_title,
      region,
      name,
      url,
      type,
      description: description ?? '',
      method: method ?? '',
      sort_order: sort_order ?? 0,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, section_id, section_title, region, name, url, type, description, method, sort_order } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('info_sources')
    .update({
      section_id,
      section_title,
      region,
      name,
      url,
      type,
      description: description ?? '',
      method: method ?? '',
      sort_order: sort_order ?? 0,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
