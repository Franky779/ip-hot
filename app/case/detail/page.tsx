import { CaseDetailClient } from './CaseDetailClient'

export default async function CaseDetailPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const params = await searchParams
  const raw = typeof params.id === 'string' ? params.id : undefined
  const id = raw ? parseInt(raw, 10) : NaN
  return <CaseDetailClient initialId={Number.isNaN(id) ? -1 : id} />
}
