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
  const { section_id, section_title, region, name, url, type, description, method, fetch_type, enabled, sort_order, is_official, platform, x_handle, x_user_id, x_profile_url, official_evidence_url, verification_status, verified_by, verified_at, last_reviewed_at, verification_notes } = body

  if (!section_id || !section_title || !region || !name || !url) {
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
      is_official: is_official ?? false, platform: platform ?? '', x_handle: x_handle ?? '', x_user_id: x_user_id ?? '', x_profile_url: x_profile_url ?? '', official_evidence_url: official_evidence_url ?? '', verification_status: verification_status ?? 'unverified', verified_by: verified_by ?? '', verified_at: verified_at || null, last_reviewed_at: last_reviewed_at || null, verification_notes: verification_notes ?? '',
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
  const { id, ids, ...changes } = body
  const targetIds = Array.isArray(ids)
    ? ids.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []

  if (!id && targetIds.length === 0) {
    return NextResponse.json({ error: 'Missing id or ids' }, { status: 400 })
  }

  const allowedFields = [
    'section_id', 'section_title', 'region', 'name', 'url', 'type',
    'description', 'method', 'fetch_type', 'enabled', 'sort_order', 'is_official', 'platform', 'x_handle', 'x_user_id', 'x_profile_url', 'official_evidence_url', 'verification_status', 'verified_by', 'verified_at', 'last_reviewed_at', 'verification_notes',
  ]
  const update = Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => allowedFields.includes(key) && value !== undefined)
  )

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let query = supabase
    .from('info_sources')
    .update(update)
  if (id) {
    query = query.eq('id', id)
  } else {
    query = query.in('id', targetIds)
    if (changes.enabled === true) {
      query = query.eq('last_test_status', 'success')
    }
  }
  const { error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
