import { LAOJIA_TALKS } from '@/lib/migrated-content'

export const metadata = { title: '老贾有话说 - IP 行业资讯快报', description: '老贾关于 IP、授权与营销的观察与思考' }

export default function TalksPage() {
  return <><header className="page-header"><h1 className="page-title font-serif">老贾有话说</h1><p className="page-sub">关于 IP、授权与营销的观察与思考 · 文章来自微信公众号</p></header><section className="talks-page article-section"><div className="talks-list">{LAOJIA_TALKS.map((item) => <article className="talk-card" key={item.id}><time dateTime={item.publishedAt}>{item.publishedAt}</time><h2>{item.title}</h2><a href={item.sourceUrl} target="_blank" rel="noreferrer">阅读原文 <span>↗</span></a></article>)}</div></section></>
}
