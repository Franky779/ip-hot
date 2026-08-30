'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../components/AdminToggle'
import type { IpSummary } from '@/lib/ipbrand-types'
import { IpBadge } from './IpBadge'

const LETTERS = ['', '#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

export function IpBrandClient() {
  const [data, setData] = useState<IpSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [q, setQ] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [cat, setCat] = useState('')
  const [init, setInit] = useState('')
  const [confirmDel, setConfirmDel] = useState<IpSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState<{ total: number; done: number } | null>(null)
  const { isAdmin, loaded: adminLoaded } = useAdmin()

  useEffect(() => {
    fetch('/api/ipbrand/summary', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<IpSummary[]>
      })
      .then(setData)
      .catch(() => setLoadError(true))
  }, [])

  // 管理员删除 IP：确认框 → 调接口 → 本地即时移除
  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const res = await fetch('/api/admin/ipbrand/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: confirmDel.id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setData(prev => (prev ? prev.filter(x => x.id !== confirmDel.id) : prev))
      setConfirmDel(null)
    } catch {
      alert('删除失败，请重试')
      setConfirmDel(null)
    } finally {
      setDeleting(false)
    }
  }

  // 多选：切换某张卡片的选中状态
  const toggleSelect = (id: number) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  // 批量删除：确认后逐个调删除接口，按钮上显示进度
  const runBulkDelete = async () => {
    const ids = [...selected]
    setConfirmBulk(false)
    setSelected([])
    setBulkDeleting({ total: ids.length, done: 0 })
    const succeeded: number[] = []
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
    for (const id of ids) {
      try {
        const res = await fetch('/api/admin/ipbrand/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
          body: JSON.stringify({ id }),
        })
        if (res.ok) succeeded.push(id)
      } catch { /* 单个失败继续下一个 */ }
      setBulkDeleting({ total: ids.length, done: succeeded.length })
    }
    setBulkDeleting(null)
    setData(prev => (prev ? prev.filter(x => succeeded.includes(x.id)) : prev))
    const failed = ids.length - succeeded.length
    if (failed) alert(`完成：成功删除 ${succeeded.length}/${ids.length}，失败 ${failed} 个`)
  }

  // 搜索防抖 80ms
  useEffect(() => {
    const t = setTimeout(() => setQ(inputValue), 80)
    return () => clearTimeout(t)
  }, [inputValue])

  const cats = useMemo(() => {
    if (!data) return []
    const map = new Map<string, number>()
    data.forEach(d => {
      const c = d.category || '未分类'
      map.set(c, (map.get(c) || 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const kw = q.trim().toLowerCase()
    return data.filter(d => {
      if (kw) {
        const hay = [d.name_cn, d.name_en, d.company, d.category, d.ip_intro, d.one_line_intro]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(kw)) return false
      }
      if (cat && d.category !== cat) return false
      if (init && d.initial !== init) return false
      return true
    })
  }, [data, q, cat, init])

  return (
    <div className="ipb-page">
      <div className="ipb-topbar">
        <div className="ipb-brand">
          <div className="ipb-brand-title">IP 品牌库</div>
          <div className="ipb-brand-meta">
            <div className="ipb-brand-count">{data ? `共 ${data.length} 个 IP` : '—'}</div>
            <div className="ipb-brand-standard">平台IP收录标准：全网粉丝5W+，授权案例5个+</div>
          </div>
        </div>
        <div className="ipb-search-wrap">
          <input
            type="text"
            className="ipb-search-input"
            placeholder="搜 IP 名 / 版权方 / 分类 / 简介关键词…"
            autoComplete="off"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
          <svg className="ipb-search-icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="ipb-topbar-right">
          {adminLoaded && isAdmin && (
            <button
              className="ipb-bulk-del-btn"
              onClick={() => setConfirmBulk(true)}
              disabled={!selected.length || !!bulkDeleting}
              title="删除选中的 IP"
            >
              {bulkDeleting ? `删除中 ${bulkDeleting.done}/${bulkDeleting.total}…` : `批量删除（${selected.length}）`}
            </button>
          )}
          <Link href="/ipbrand/new" className="ipb-add-btn">＋ 新增 IP</Link>
        </div>
      </div>

      <div className="ipb-main">
        <div className="ipb-cat-row">
          <button
            className={`ipb-cat-btn${cat === '' ? ' active' : ''}`}
            onClick={() => setCat('')}
          >
            全部 ({data ? data.length : 0})
          </button>
          {cats.map(([name, count]) => (
            <button
              key={name}
              className={`ipb-cat-btn${cat === name ? ' active' : ''}`}
              onClick={() => setCat(name)}
            >
              {name} ({count})
            </button>
          ))}
        </div>

        <div className="ipb-init-row">
          {LETTERS.map(l => (
            <button
              key={l === '' ? '__all' : l}
              className={`ipb-init-btn${init === l ? ' active' : ''}`}
              onClick={() => setInit(l)}
            >
              {l === '' ? '全部' : l}
            </button>
          ))}
        </div>

        <div className="ipb-grid">
          {loadError && (
            <div className="ipb-empty">
              <div className="ipb-empty-text">数据加载失败，请刷新重试</div>
            </div>
          )}
          {!loadError && !data && <div className="ipb-loading">加载档案中…</div>}
          {data && filtered.length === 0 && (
            <div className="ipb-empty">
              <div className="ipb-empty-icon">🔍</div>
              <div className="ipb-empty-text">没有找到匹配的 IP</div>
              <div className="ipb-empty-sub">试试换关键词、清除分类或换首字母</div>
            </div>
          )}
          {data && filtered.map(d => {
            const isSelected = selected.includes(d.id)
            return (
            <Link key={d.id} href={`/ipbrand/detail?id=${d.id}`} className={`ipb-card${isSelected ? ' selected' : ''}`} title={d.name_cn}>
              <div className="ipb-card-cover">
                {adminLoaded && isAdmin && (
                  <span
                    className={`ipb-select-box${isSelected ? ' on' : ''}`}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); toggleSelect(d.id) }}
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                {d.cover ? (
                  <img src={`/ipbrand/${d.cover}`} alt={d.name_cn} loading="lazy" />
                ) : (
                  <div className="ipb-card-placeholder">{d.name_cn ? d.name_cn[0] : '?'}</div>
                )}
                <span className={`ipb-case-badge${d.case_len ? '' : ' zero'}`}>
                  {d.case_len ? `案例 ${d.case_len}` : '暂无案例'}
                </span>
                {d.verified && <span className="factory-card-verified"><IpBadge size={13} />老贾已建联</span>}
                {adminLoaded && isAdmin && (
                  <button
                    className="ipb-del-btn"
                    title="删除此 IP"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setConfirmDel(d)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="ipb-card-name"><span>{d.name_cn || d.name_en || '(未命名)'}</span>{d.verified && <IpBadge size={13} />}</div>
            </Link>
            )
          })}
        </div>
      </div>

      {confirmDel && (
        <div className="ipb-confirm-mask" onClick={() => !deleting && setConfirmDel(null)}>
          <div className="ipb-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="ipb-confirm-title">删除确认</div>
            <div className="ipb-confirm-text">
              确定从 IP品牌库中删除「{confirmDel.name_cn || confirmDel.name_en}」吗？
              <div className="ipb-confirm-sub">删除后此 IP 不再在列表和搜索中出现，且不可撤销。</div>
            </div>
            <div className="ipb-confirm-actions">
              <button className="ipb-confirm-cancel" onClick={() => setConfirmDel(null)} disabled={deleting}>
                取消
              </button>
              <button className="ipb-confirm-ok" onClick={handleDelete} disabled={deleting}>
                {deleting ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBulk && (
        <div className="ipb-confirm-mask" onClick={() => setConfirmBulk(false)}>
          <div className="ipb-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="ipb-confirm-title">批量删除确认</div>
            <div className="ipb-confirm-text">
              确定从 IP品牌库中删除选中的 {selected.length} 个 IP 吗？
              <div className="ipb-confirm-sub">删除后这些 IP 不再在列表和搜索中出现，且不可撤销。</div>
            </div>
            <div className="ipb-confirm-actions">
              <button className="ipb-confirm-cancel" onClick={() => setConfirmBulk(false)}>取消</button>
              <button className="ipb-confirm-ok" onClick={runBulkDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
