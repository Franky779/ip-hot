import type { Metadata } from 'next'
import PeriodReportView from '@/app/components/PeriodReportView'

export const revalidate = 120

export const metadata: Metadata = {
  title: '行业日报 | IP-HOT',
  description: 'IP 行业每日资讯汇总：分类速览、本期看点、热点事件',
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  return <PeriodReportView period="daily" date={params.date} title="行业日报" />
}
