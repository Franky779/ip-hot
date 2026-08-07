'use client'

import { useRef, useEffect, useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'

type Feedback = { id: string; content: string; wechat: string | null; image: string | null; created_at: string }

export function FeedbackClient() {
  const { isAdmin, loaded } = useAdmin()
  const [content, setContent] = useState('')
  const [wechat, setWechat] = useState('')
  const [image, setImage] = useState('')
  const [imageName, setImageName] = useState('')
  const [notice, setNotice] = useState('')
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loaded || !isAdmin) return; fetch('/api/feedback', { headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' } }).then((response) => response.json()).then((result) => setItems(result.feedback || [])) }, [loaded, isAdmin])

  const loadImage = (file: File, name?: string) => {
    if (file.size > 2_800_000) { setNotice('图片不能超过 2 MB'); return }
    setImageName(name || file.name)
    const reader = new FileReader()
    reader.onload = () => setImage(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    loadImage(file)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        event.preventDefault()
        const file = items[i].getAsFile()
        if (file) loadImage(file, '截图 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
        return
      }
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setNotice('')
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, wechat, image, website: '' }) })
    const result = await response.json(); setLoading(false)
    if (!response.ok) { setNotice(result.error || '提交失败'); return }
    setContent(''); setWechat(''); setImage(''); setImageName('')
    if (fileRef.current) fileRef.current.value = ''
    setNotice('感谢你的反馈，我已经收到了。')
  }

  const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  return <><header className="page-header feedback-header"><div className="feedback-intro"><p className="eyebrow">反馈</p><h1 className="page-title font-serif">说说你的想法</h1><p className="page-sub">发现 bug、想要的功能、看不顺眼的地方，都可以告诉我。<br />我都会看到。</p></div></header><section className="feedback-page article-section"><form className="feedback-form" onSubmit={submit}><label htmlFor="feedback-content">想说点什么?</label><textarea id="feedback-content" maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} onPaste={handlePaste} placeholder="描述你遇到的问题，也可以直接粘贴截图" required /><div className="feedback-count">{content.length} / 2000</div><label htmlFor="feedback-wechat">微信号 <span>（选填）</span></label><input id="feedback-wechat" type="text" value={wechat} onChange={(event) => setWechat(event.target.value)} placeholder="留下微信号，我可以联系你" /><label htmlFor="feedback-image">截图 <span>（选填）</span></label><input ref={fileRef} id="feedback-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />{imageName && <div className="feedback-image-preview">{imageName} <button type="button" onClick={() => { setImage(''); setImageName(''); if (fileRef.current) fileRef.current.value = '' }}>移除</button></div>}<button type="submit" className="feedback-submit" disabled={loading}>{loading ? '发送中…' : '发送反馈'}</button>{notice && <p className="feedback-notice">{notice}</p>}</form>{loaded && isAdmin && <section className="feedback-records"><h2>反馈记录 <span>{items.length}</span></h2>{items.length === 0 ? <p className="empty-state">暂无反馈记录。</p> : items.map((item) => <article className="feedback-record" key={item.id}><p>{item.content}</p>{item.image && <img src={item.image} alt="反馈截图" className="feedback-record-image" />}<div><span>{item.wechat || '未留下微信号'}</span><time dateTime={item.created_at}>{formatTime(item.created_at)}</time></div></article>)}</section>}</section></>
}
