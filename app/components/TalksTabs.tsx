'use client'

import { useState } from 'react'
import { LAOJIA_TALKS } from '@/lib/migrated-content'

const TABS = [
  { key: 'articles', label: '公众号文章' },
  { key: 'knowledge', label: '专业用语' },
  { key: 'podcast', label: '播客/直播' },
  { key: 'courses', label: '线上课程' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function TalksTabs() {
  const [active, setActive] = useState<TabKey>('articles')

  return (
    <>
      <nav className="talks-tab-bar" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`talks-tab${active === tab.key ? ' active' : ''}`}
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="talks-tab-content">
        {active === 'articles' && (
          <div className="talks-list">
            {LAOJIA_TALKS.map((item) => (
              <article className="talk-card" key={item.id}>
                <time dateTime={item.publishedAt}>{item.publishedAt}</time>
                <h2>{item.title}</h2>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  阅读原文 <span>↗</span>
                </a>
              </article>
            ))}
          </div>
        )}

        {active === 'knowledge' && (
          <div className="talks-placeholder">
            <p className="empty-state">专业用语库建设中，敬请期待。</p>
          </div>
        )}

        {active === 'podcast' && (
          <div className="talks-placeholder">
            <p className="empty-state">播客与直播内容即将上线。</p>
          </div>
        )}

        {active === 'courses' && (
          <div className="talks-placeholder">
            <p className="empty-state">线上课程即将上线。</p>
          </div>
        )}
      </section>
    </>
  )
}
