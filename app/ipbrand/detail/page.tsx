import { IpDetailClient } from './IpDetailClient'

export const metadata = {
  title: 'IP 详情 - IP品牌库',
  description: 'IP 授权档案详情：版权方、可授权地区、重点授权品类、对外展示图与授权案例',
}

export default async function IpDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  const sp = await searchParams
  const raw = typeof sp.id === 'string' ? sp.id : undefined
  const n = raw ? parseInt(raw, 10) : NaN
  return <IpDetailClient initialId={Number.isNaN(n) ? -1 : n} />
}
