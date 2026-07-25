'use client'

import { useEffect, useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'

type Feedback = { id: string; content: string; email: string | null; created_at: string }

export function FeedbackClient() {
  const { isAdmin, loaded } = useAdmin()
  const [content, setContent] = useState('')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (!loaded || !isAdmin) return; fetch('/api/feedback', { headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' } }).then((response) => response.json()).then((result) => setItems(result.feedback || [])) }, [loaded, isAdmin])
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); setNotice(''); const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, email, website: '' }) }); const result = await response.json(); setLoading(false); if (!response.ok) { setNotice(result.error || '提交失败'); return }; setContent(''); setEmail(''); setNotice('感谢你的反馈，我已经收到了。') }
  const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  return <><header className="page-header feedback-header"><div className="feedback-intro"><p className="eyebrow">反馈</p><h1 className="page-title font-serif">说说你的想法</h1><p className="page-sub">发现 bug、想要的功能、看不顺眼的地方，都可以告诉我。<br />我都会看到。</p></div></header><section className="feedback-page article-section"><form className="feedback-form" onSubmit={submit}><label htmlFor="feedback-content">想说点什么?</label><textarea id="feedback-content" maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="比如" required /><div className="feedback-count">{content.length} / 2000</div><label htmlFor="feedback-email">邮箱 <span>（选填）</span></label><input id="feedback-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="留下邮箱，我可以回信联系你" /><button type="submit" className="feedback-submit" disabled={loading}>{loading ? '发送中…' : '发送反馈'}</button>{notice && <p className="feedback-notice">{notice}</p>}</form>{loaded && isAdmin && <section className="feedback-records"><h2>反馈记录 <span>{items.length}</span></h2>{items.length === 0 ? <p className="empty-state">暂无反馈记录。</p> : items.map((item) => <article className="feedback-record" key={item.id}><p>{item.content}</p><div><span>{item.email || '未留下邮箱'}</span><time dateTime={item.created_at}>{formatTime(item.created_at)}</time></div></article>)}</section>}</section></>
}
