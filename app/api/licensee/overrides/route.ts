import { NextResponse } from 'next/server'
import { loadLicenseeAdmin } from '@/lib/licensee-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(loadLicenseeAdmin())
  } catch {
    return NextResponse.json({ deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } })
  }
}
