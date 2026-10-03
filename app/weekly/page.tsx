import type { Metadata } from 'next'
import PeriodReportView from '@/app/components/PeriodReportView'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'IP 行业周报 | IP-HOT',
  description: 'IP 行业周报：本期热点事件 Top 10、活跃 IP、授权交易动态与数据快照',
}

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  return <PeriodReportView period="weekly" date={params.date} title="IP 行业周报" />
}
