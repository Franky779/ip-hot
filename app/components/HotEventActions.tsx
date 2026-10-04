'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin, ADMIN_PW_KEY } from './AdminToggle'

/**
 * 热点榜后台操作（仅管理员可见）。
 *
 * 设计取舍：这里用「隐藏」而不是「删除」。事件是多篇报道的聚簇，
 * 删掉事件会连带删掉 ip_event_reports 关联，而其中可能有你之后想复查的报道。
 * 隐藏只是让它退出榜单，随时能恢复——热点榜每 15 分钟重排，
 * 隐藏一条后下一轮自然由后面的事件补足位次，不需要额外处理。
 */
export function HotEventActions({
  eventId,
  industryRelevant,
}: {
  eventId: string
  industryRelevant: boolean | null
}) {
  const { isAdmin, loaded } = useAdmin()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!loaded || !isAdmin) return null

  const call = async (action: string, reason?: string) => {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/events/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '',
        },
        body: JSON.stringify({ action, eventId, reason }),
      })
      if (res.ok) {
        setNote('已处理')
        router.refresh()
      } else {
        setNote('操作失败')
      }
    } catch {
      setNote('网络错误')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hot-admin-actions">
      <button
        type="button"
        className="hot-admin-btn"
        disabled={busy}
        onClick={() => {
          if (confirm('把这个事件移出热点榜？事件与报道会保留，随时可以恢复。')) {
            void call('hide', '人工判定与 IP 授权行业无关')
          }
        }}
      >
        不相关，移出榜单
      </button>
      {industryRelevant === false && (
        <button
          type="button"
          className="hot-admin-btn hot-admin-btn-keep"
          disabled={busy}
          onClick={() => void call('markRelevant', '人工确认有授权价值')}
        >
          其实相关，放回榜单
        </button>
      )}
      {note && <span className="hot-admin-note">{note}</span>}
    </div>
  )
}
