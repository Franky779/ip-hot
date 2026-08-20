import { NextResponse } from 'next/server'
import { loadFactoryAdmin } from '@/lib/factory-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(loadFactoryAdmin())
  } catch {
    return NextResponse.json({ deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } })
  }
}
