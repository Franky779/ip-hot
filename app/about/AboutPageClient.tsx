'use client'

import { useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'
import type { AboutBlock, AboutPageContent } from '@/lib/site-pages'

function password() { return localStorage.getItem(ADMIN_PW_KEY) || '' }
function blockId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

export function AboutPageClient({ initialContent }: { initialContent: AboutPageContent }) {
  const { isAdmin, loaded } = useAdmin()
  const [content, setContent] = useState(initialContent)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [notice, setNotice] = useState('')

  const save = async () => {
    setNotice('保存中…')
    const response = await fetch('/api/site-pages', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-password': password() }, body: JSON.stringify(draft) })
    const result = await response.json()
    if (!response.ok) { setNotice(result.error || '保存失败'); return }
    setContent(draft); setEditing(false); setNotice('已更新')
  }

  const updateBlock = (index: number, patch: Partial<AboutBlock>) => setDraft((value) => ({ ...value, blocks: value.blocks.map((block, i) => i === index ? { ...block, ...patch } as AboutBlock : block) }))
  const removeBlock = (index: number) => setDraft((value) => ({ ...value, blocks: value.blocks.filter((_, i) => i !== index) }))
  const moveBlock = (index: number, offset: number) => setDraft((value) => { const blocks = [...value.blocks]; const target = index + offset; if (target < 0 || target >= blocks.length) return value; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; return { ...value, blocks } })
  const addText = (type: 'heading' | 'text') => setDraft((value) => ({ ...value, blocks: [...value.blocks, { id: blockId(), type, text: '' }] }))
  const addImage = (file: File) => { const reader = new FileReader(); reader.onload = () => setDraft((value) => ({ ...value, blocks: [...value.blocks, { id: blockId(), type: 'image', dataUrl: String(reader.result), alt: '', caption: '' }] })); reader.readAsDataURL(file) }

  return <>
    <header className="page-header"><div className="home-header-top"><div><h1 className="page-title font-serif">{content.title}</h1><p className="page-sub">关于老贾 · 记录行业观察与个人介绍</p></div>{loaded && isAdmin && <button className="admin-action-btn" onClick={() => { setDraft(content); setEditing(true); setNotice('') }}>编辑内容</button>}</div></header>
    <section className="about-page article-section">
      {content.blocks.length === 0 ? <p className="empty-state">内容正在准备中。</p> : content.blocks.map((block) => block.type === 'image' ? <figure className="about-image-block" key={block.id}><img src={block.dataUrl} alt={block.alt} /><figcaption>{block.caption}</figcaption></figure> : block.type === 'heading' ? <h2 className="about-heading" key={block.id}>{block.text}</h2> : <p className="about-text" key={block.id}>{block.text}</p>)}
    </section>
    {editing && <div className="admin-modal-overlay"><div className="admin-modal about-editor"><h3>编辑关于老贾</h3><label>页面标题</label><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /><div className="about-editor-toolbar"><button onClick={() => addText('heading')}>添加小标题</button><button onClick={() => addText('text')}>添加文字</button><label className="about-upload-btn">添加图片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) addImage(file); event.currentTarget.value = '' }} /></label></div><div className="about-editor-blocks">{draft.blocks.map((block, index) => <div className="about-editor-block" key={block.id}><div className="about-editor-block-actions"><button onClick={() => moveBlock(index, -1)} disabled={index === 0}>上移</button><button onClick={() => moveBlock(index, 1)} disabled={index === draft.blocks.length - 1}>下移</button><button onClick={() => removeBlock(index)}>删除</button></div>{block.type === 'image' ? <><img src={block.dataUrl} alt="预览" /><input placeholder="图片说明" value={block.caption} onChange={(event) => updateBlock(index, { caption: event.target.value })} /><input placeholder="图片替代文字" value={block.alt} onChange={(event) => updateBlock(index, { alt: event.target.value })} /></> : <textarea rows={block.type === 'heading' ? 2 : 5} placeholder={block.type === 'heading' ? '小标题' : '正文'} value={block.text} onChange={(event) => updateBlock(index, { text: event.target.value })} />}</div>)}</div>{notice && <p className="admin-notice">{notice}</p>}<div className="admin-modal-btns"><button onClick={() => setEditing(false)}>取消</button><button className="admin-submit" onClick={save}>确认更新</button></div></div></div>}
  </>
}
