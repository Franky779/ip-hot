'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

export type HotEventLite = {
  id: string
  title: string
  sourceCount: number
  heatScore: number
}

/** 一份内容的可视阅读时间（秒）。太长看不完，太短来不及点。 */
const READ_SECONDS = 12
/** 单轮时长上下限（秒），防止内容极端多/少时快到看不清或慢到看不出在动。 */
const MIN_DURATION = 14
const MAX_DURATION = 90

/**
 * 首页顶部「🔥 热点」自动滚动条。
 *
 * 为什么要复制多份：CSS 循环动画必须"跑完一段无缝接上第二段"才看不出接缝。
 * 元素少的时候（常见只有 5 条）一份内容填不满容器，滚动到末尾会露白，
 * 所以先量出一份的实际宽度，再复制到"至少能铺满两屏"为止。
 *
 * 悬停 / 键盘聚焦时暂停：条目本身是链接，一滚动就点不中。
 */
export function HotTicker({ events }: { events: HotEventLite[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const setRef = useRef<HTMLDivElement>(null)
  const [copies, setCopies] = useState(2)
  const [setWidth, setSetWidth] = useState(0)
  const [reduced, setReduced] = useState(false)

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    const set = setRef.current
    if (!viewport || !set) return
    const oneCopy = Math.ceil(set.offsetWidth)
    if (oneCopy <= 0) return
    setSetWidth(oneCopy)
    // 铺满一屏 + 一份，保证滚回起点前右侧始终有内容
    const need = Math.ceil((viewport.clientWidth + oneCopy) / oneCopy) + 1
    setCopies(Math.max(2, Math.min(need, 12)))
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => setReduced(media.matches)
    syncMotion()
    media.addEventListener('change', syncMotion)

    measure()
    const viewport = viewportRef.current
    if (!viewport) {
      media.removeEventListener('change', syncMotion)
      return () => media.removeEventListener('change', syncMotion)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    if (setRef.current) observer.observe(setRef.current)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', syncMotion)
    }
  }, [measure, events.length])

  if (events.length === 0) return null

  const duration = setWidth > 0
    ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, setWidth / READ_SECONDS))
    : 26

  return (
    <div className="hot-strip">
      <Link href="/hot" className="hot-strip-label">
        🔥 热点
      </Link>
      <div className="hot-strip-viewport" ref={viewportRef}>
        <div
          className="hot-strip-track"
          style={
            reduced || setWidth === 0
              ? undefined
              : ({
                  animationName: 'hot-strip-scroll',
                  animationDuration: `${duration}s`,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  // 每秒位移固定，条数增减不影响滚动快慢
                  ['--hot-strip-shift' as string]: `${-setWidth}px`,
                } as CSSProperties)
          }
        >
          {Array.from({ length: copies }).map((_, copyIndex) => (
            <div className="hot-strip-set" key={copyIndex} ref={copyIndex === 0 ? setRef : undefined}>
              {events.map((ev) => (
                <Link
                  key={`${copyIndex}-${ev.id}`}
                  href={`/hot/${ev.id}`}
                  className="hot-strip-item"
                  title={`${ev.title}（热度 ${ev.heatScore.toFixed(1)}）`}
                  aria-hidden={copyIndex > 0 ? true : undefined}
                  tabIndex={copyIndex > 0 ? -1 : undefined}
                >
                  {ev.title}
                  <span className="hot-strip-count">{ev.sourceCount}家</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
