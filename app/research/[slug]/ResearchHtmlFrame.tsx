'use client'

import { useEffect, useRef, useState } from 'react'
import { RESEARCH_HTML_HEIGHT_MESSAGE } from '@/lib/research-html'

export function ResearchHtmlFrame({ slug, title }: { slug: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(900)

  useEffect(() => {
    function updateHeight(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== RESEARCH_HTML_HEIGHT_MESSAGE) return
      const nextHeight = Math.ceil(Number(event.data.height))
      if (Number.isFinite(nextHeight) && nextHeight >= 320 && nextHeight <= 50_000) setHeight(nextHeight)
    }
    window.addEventListener('message', updateHeight)
    return () => window.removeEventListener('message', updateHeight)
  }, [])

  return <iframe ref={frameRef} className="research-html-frame" src={`/api/research/${encodeURIComponent(slug)}/document`} title={title} sandbox="allow-scripts allow-downloads" style={{ height }} />
}
