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
  const { section_id, section_title, region, name, url, type, description, method, fetch_type, enabled, sort_order } = body

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
      fetch_type: fetch_type ?? 'web',
      enabled: enabled ?? false,
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
  const { id, ...changes } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const allowedFields = [
    'section_id', 'section_title', 'region', 'name', 'url', 'type',
    'description', 'method', 'fetch_type', 'enabled', 'sort_order',
  ]
  const update = Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => allowedFields.includes(key) && value !== undefined)
  )

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('info_sources')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
