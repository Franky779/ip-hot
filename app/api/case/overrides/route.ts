import { NextResponse } from 'next/server'
import { loadCaseAdmin } from '@/lib/case-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(loadCaseAdmin())
  } catch {
    return NextResponse.json({ deleted: [], edits: {}, new_records: [], config: { custom_categories: [], custom_cities: [] } })
  }
}
