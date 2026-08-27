import { LicenseeDetailClient } from './LicenseeDetailClient'

export default async function LicenseeDetailPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const params = await searchParams
  const raw = typeof params.id === 'string' ? params.id : undefined
  const id = raw ? parseInt(raw, 10) : NaN
  return <LicenseeDetailClient initialId={Number.isNaN(id) ? -1 : id} />
}
