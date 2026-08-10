import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '随手收 - IP-HOT',
  description: '粘贴微信文章链接，一键收录进资讯库',
}

export default function CollectLayout({ children }: { children: React.ReactNode }) {
  return children
}
