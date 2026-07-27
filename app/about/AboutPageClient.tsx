'use client'

import { useState } from 'react'
import { prepareAboutImage, rotateAboutImage } from '@/lib/about-image-client'
import {
  MAX_TOTAL_IMAGE_DATA_URL_LENGTH,
  type AboutBlock,
  type AboutImageAlign,
  type AboutImageWidth,
  type AboutPageContent,
} from '@/lib/site-pages'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'

function password() { return localStorage.getItem(ADMIN_PW_KEY) || '' }
function blockId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

function imageClassName(block: Extract<AboutBlock, { type: 'image' }>) {
  return `about-image-block about-image-width-${block.width ?? 100} about-image-align-${block.align ?? 'center'}`
}

function AboutContent({ content }: { content: AboutPageContent }) {
  if (content.blocks.length === 0) return <p className="empty-state">内容正在准备中。</p>
  return content.blocks.map((block) => {
    if (block.type === 'image') {
      return <figure className={imageClassName(block)} key={block.id}><img src={block.dataUrl} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
    }
    if (block.type === 'heading') return <h2 className="about-heading" key={block.id}>{block.text}</h2>
    return <p className="about-text" key={block.id}>{block.text}</p>
  })
}

function totalImageLength(blocks: AboutBlock[]) {
  return blocks.reduce((total, block) => total + (block.type === 'image' ? block.dataUrl.length : 0), 0)
}

export function AboutPageClient({ initialContent }: { initialContent: AboutPageContent }) {
  const { isAdmin, loaded } = useAdmin()
  const [content, setContent] = useState(initialContent)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [processingImage, setProcessingImage] = useState(false)

  const save = async () => {
    setSaving(true)
    setNotice('保存中…')
    try {
      const response = await fetch('/api/site-pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password() },
        body: JSON.stringify(draft),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; content?: AboutPageContent }
      if (!response.ok) {
        setNotice(result.error || '保存失败，请稍后重试')
        return
      }
      setContent(result.content ?? draft)
      setEditing(false)
    } catch {
      setNotice('网络异常，保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const updateBlock = (index: number, patch: Partial<AboutBlock>) => setDraft((value) => ({
    ...value,
    blocks: value.blocks.map((block, currentIndex) => currentIndex === index ? { ...block, ...patch } as AboutBlock : block),
  }))

  const removeBlock = (index: number) => setDraft((value) => ({ ...value, blocks: value.blocks.filter((_, currentIndex) => currentIndex !== index) }))

  const moveBlock = (index: number, offset: number) => setDraft((value) => {
    const blocks = [...value.blocks]
    const target = index + offset
    if (target < 0 || target >= blocks.length) return value
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    return { ...value, blocks }
  })

  const addText = (type: 'heading' | 'text') => setDraft((value) => ({
    ...value,
    blocks: [...value.blocks, { id: blockId(), type, text: '' }],
  }))

  const setImage = async (file: File, index?: number) => {
    setProcessingImage(true)
    setNotice('正在处理图片…')
    try {
      const dataUrl = await prepareAboutImage(file)
      const imageBlock: AboutBlock = { id: blockId(), type: 'image', dataUrl, alt: '', caption: '', width: 100, align: 'center' }
      const blocks = index === undefined
        ? [...draft.blocks, imageBlock]
        : draft.blocks.map((block, currentIndex) => currentIndex === index && block.type === 'image' ? { ...block, dataUrl } : block)
      if (totalImageLength(blocks) > MAX_TOTAL_IMAGE_DATA_URL_LENGTH) {
        setNotice('全部图片合计不能超过 6 MB')
        return
      }
      setDraft({ ...draft, blocks })
      setNotice('图片已处理')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      setProcessingImage(false)
    }
  }

  const rotateImage = async (index: number, direction: -1 | 1) => {
    const block = draft.blocks[index]
    if (block?.type !== 'image') return
    setProcessingImage(true)
    setNotice('正在旋转图片…')
    try {
      updateBlock(index, { dataUrl: await rotateAboutImage(block.dataUrl, direction) })
      setNotice('图片已旋转')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      setProcessingImage(false)
    }
  }

  const openEditor = () => {
    setDraft(content)
    setNotice('')
    setEditing(true)
  }

  return <>
    <header className="page-header">
      <div className="home-header-top">
        <div><h1 className="page-title font-serif">{content.title}</h1><p className="page-sub">关于老贾 · 记录行业观察与个人介绍</p></div>
        {loaded && isAdmin && <button className="admin-action-btn" onClick={openEditor}>编辑内容</button>}
      </div>
    </header>
    <section className="about-page article-section"><AboutContent content={content} /></section>
    {editing && <div className="admin-modal-overlay">
      <div className="admin-modal about-editor" role="dialog" aria-modal="true" aria-labelledby="about-editor-title">
        <div className="about-editor-header">
          <h3 id="about-editor-title">编辑关于老贾</h3>
          <button className="about-editor-close" type="button" title="关闭" aria-label="关闭" onClick={() => setEditing(false)} disabled={saving || processingImage}>×</button>
        </div>
        <label className="about-editor-page-title">页面标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <div className="about-editor-workspace">
          <div className="about-editor-panel">
            <div className="about-editor-toolbar">
              <button type="button" onClick={() => addText('heading')}>添加小标题</button>
              <button type="button" onClick={() => addText('text')}>添加文字</button>
              <label className={`about-upload-btn${processingImage ? ' disabled' : ''}`}>上传图片<input type="file" accept="image/png,image/jpeg,image/webp" disabled={processingImage} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void setImage(file) }} /></label>
            </div>
            <div className="about-editor-blocks">
              {draft.blocks.length === 0 && <p className="about-editor-empty">暂无内容</p>}
              {draft.blocks.map((block, index) => <div className="about-editor-block" key={block.id}>
                <div className="about-editor-block-actions">
                  <span>{block.type === 'heading' ? '小标题' : block.type === 'text' ? '文字' : '图片'}</span>
                  <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0 || processingImage}>上移</button>
                  <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === draft.blocks.length - 1 || processingImage}>下移</button>
                  <button type="button" onClick={() => removeBlock(index)} disabled={processingImage}>删除</button>
                </div>
                {block.type === 'image' ? <div className="about-editor-image-row">
                  <img src={block.dataUrl} alt="图片预览" />
                  <div className="about-editor-image-controls">
                    <div className="about-editor-image-actions">
                      <label className={`about-upload-btn${processingImage ? ' disabled' : ''}`}>替换<input type="file" accept="image/png,image/jpeg,image/webp" disabled={processingImage} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void setImage(file, index) }} /></label>
                      <button type="button" onClick={() => void rotateImage(index, -1)} disabled={processingImage}>左转</button>
                      <button type="button" onClick={() => void rotateImage(index, 1)} disabled={processingImage}>右转</button>
                    </div>
                    <div className="about-editor-image-settings">
                      <label>宽度<select value={block.width ?? 100} onChange={(event) => updateBlock(index, { width: Number(event.target.value) as AboutImageWidth })}><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select></label>
                      <label>对齐<select value={block.align ?? 'center'} onChange={(event) => updateBlock(index, { align: event.target.value as AboutImageAlign })}><option value="left">左侧</option><option value="center">居中</option><option value="right">右侧</option></select></label>
                    </div>
                    <input placeholder="图片说明" value={block.caption} onChange={(event) => updateBlock(index, { caption: event.target.value })} />
                    <input placeholder="图片替代文字" value={block.alt} onChange={(event) => updateBlock(index, { alt: event.target.value })} />
                  </div>
                </div> : <textarea rows={block.type === 'heading' ? 2 : 7} placeholder={block.type === 'heading' ? '小标题' : '正文'} value={block.text} onChange={(event) => updateBlock(index, { text: event.target.value })} />}
              </div>)}
            </div>
          </div>
          <div className="about-editor-preview">
            <span>实时预览</span>
            <div className="about-editor-preview-content"><h1 className="font-serif">{draft.title || '关于老贾'}</h1><AboutContent content={draft} /></div>
          </div>
        </div>
        <div className="about-editor-footer">
          <p className="admin-notice" aria-live="polite">{notice}</p>
          <div className="admin-modal-btns"><button type="button" onClick={() => setEditing(false)} disabled={saving || processingImage}>取消</button><button type="button" className="admin-submit" onClick={save} disabled={saving || processingImage}>{saving ? '保存中…' : '确认更新'}</button></div>
        </div>
      </div>
    </div>}
  </>
}
