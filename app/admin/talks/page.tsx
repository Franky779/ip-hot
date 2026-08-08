import { TalksAdminClient } from './TalksAdminClient'

export const metadata = { title: '专业知识管理 - IP 行业资讯快报' }
export const revalidate = 0

export default function TalksAdminPage() {
  return (
    <>
      <header className="page-header">
        <div className="talks-header-row">
          <h1 className="page-title font-serif">专业知识 · 管理</h1>
          <p className="page-sub">管理公众号文章、专业用语、播客/直播、线上课程</p>
        </div>
      </header>
      <TalksAdminClient />
    </>
  )
}
