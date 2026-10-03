import type { Metadata } from 'next'
import PeriodReportView from '@/app/components/PeriodReportView'

export const revalidate = 900

export const metadata: Metadata = {
  title: 'IP 行业月报 | IP-HOT',
  description: 'IP 行业月报：全月热点事件榜、活跃 IP Top 10、授权交易线索与趋势复盘',
}

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  return <PeriodReportView period="monthly" date={params.date} title="IP 行业月报" />
}
