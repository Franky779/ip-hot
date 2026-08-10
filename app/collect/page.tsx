'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../components/AdminToggle'

type CollectArticle = {
  id: string
  title: string
  title_cn: string
  summary_cn: string
  category: string
  relevance_score: number | null
  commentary: string | null
  coverUrl?: string | null
  publishedAt?: string | null
}

type CollectAccount = {
  name: string | null
  isNewSource: boolean
  sourceId: string | null
  isResident: boolean
}

type CollectResponse = {
  ok: boolean
  duplicate: boolean
  article?: CollectArticle
  account?: CollectAccount
  llm?: 'ok' | 'degraded'
  error?: string
}

type Phase = 'idle' | 'loading' | 'result'

function getPw(): string {
  return localStorage.getItem(ADMIN_PW_KEY) || ''
}

function scoreClass(score: number | null): string {
  if (score === null) return 'collect-score-muted'
  if (score >= 7) return 'collect-score-high'
  if (score >= 4) return 'collect-score-mid'
  return 'collect-score-low'
}

export default function CollectPage() {
  const { isAdmin, loaded } = useAdmin()
  const [justAuthed, setJustAuthed] = useState(false)
  const authed = isAdmin || justAuthed

  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<CollectResponse | null>(null)
  const [error, setError] = useState('')

  const [showUpgrade, setShowUpgrade] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeMessage, setUpgradeMessage] = useState('')
  const [upgraded, setUpgraded] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthBusy(true)
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        localStorage.setItem('ip-hot-admin', '1')
        localStorage.setItem(ADMIN_PW_KEY, password)
        setJustAuthed(true)
      } else {
        setAuthError('密码错误')
      }
    } catch {
      setAuthError('网络错误，请重试')
    }
    setAuthBusy(false)
  }

  const handleSubmit = async () => {
    if (!text.trim() || phase === 'loading') return
    setPhase('loading')
    setError('')
    setResult(null)
    setShowUpgrade(false)
    setUpgraded(false)
    setUpgradeMessage('')
    setFeedUrl('')
    try {
      const res = await fetch('/api/admin/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': getPw() },
        body: JSON.stringify({ text }),
      })
      const data = (await res.json()) as CollectResponse
      if (!res.ok) {
        setError(data.error || `提交失败（HTTP ${res.status}）`)
        setPhase('idle')
        return
      }
      setResult(data)
      setPhase('result')
    } catch {
      setError('网络错误或请求超时，请重试')
      setPhase('idle')
    }
  }

  const handleUpgrade = async () => {
    if (!result?.account?.sourceId || !feedUrl.trim() || upgradeBusy) return
    setUpgradeBusy(true)
    setUpgradeMessage('')
    try {
      const res = await fetch('/api/admin/collect/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': getPw() },
        body: JSON.stringify({ sourceId: result.account.sourceId, feedUrl: feedUrl.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setUpgraded(true)
        setUpgradeMessage(data.message || '已升级为常驻信息源')
      } else {
        setUpgradeMessage(data.error || '升级失败，请检查 RSS 地址')
      }
    } catch {
      setUpgradeMessage('网络错误，请重试')
    }
    setUpgradeBusy(false)
  }

  const reset = () => {
    setText('')
    setResult(null)
    setError('')
    setPhase('idle')
    setShowUpgrade(false)
    setUpgraded(false)
    setUpgradeMessage('')
    setFeedUrl('')
  }

  if (!loaded) return <main className="collect-page"><p className="collect-hint">加载中…</p></main>

  if (!authed) {
    return (
      <main className="collect-page">
        <header className="collect-header">
          <h1>📥 随手收</h1>
          <p>看到好的公众号文章，粘贴链接就收录</p>
        </header>
        <form className="collect-login" onSubmit={handleLogin}>
          <label htmlFor="collect-pw">管理员密码</label>
          <input
            id="collect-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入管理员密码"
            autoFocus
          />
          {authError && <p className="collect-error">{authError}</p>}
          <button type="submit" className="collect-primary-btn" disabled={authBusy || !password}>
            {authBusy ? '验证中…' : '登录'}
          </button>
          <p className="collect-hint">与网站管理后台同一密码，登录一次全站通用</p>
        </form>
      </main>
    )
  }

  return (
    <main className="collect-page">
      <header className="collect-header">
        <h1>📥 随手收</h1>
        <p>看到好的公众号文章，粘贴链接就收录</p>
      </header>

      {phase !== 'result' && (
        <section className="collect-input-area">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴微信文章链接，可以带其他文字"
            rows={4}
            disabled={phase === 'loading'}
            autoFocus
          />
          {error && <p className="collect-error">{error}</p>}
          <button
            className="collect-primary-btn"
            onClick={handleSubmit}
            disabled={phase === 'loading' || !text.trim()}
          >
            {phase === 'loading' ? '抓取 + AI 分类中…' : '收藏这篇文章'}
          </button>
          {phase === 'loading' && (
            <p className="collect-hint">约需 1 分钟，请勿关闭页面</p>
          )}
        </section>
      )}

      {phase === 'result' && result?.article && (
        <section className="collect-result">
          {result.duplicate && (
            <p className="collect-duplicate">这篇文章之前已经收过了</p>
          )}
          {result.llm === 'degraded' && !result.duplicate && (
            <p className="collect-duplicate">AI 分类暂时失败，已收录并放入「待人工复核」，请稍后到复核页完善分类</p>
          )}
          <article className="collect-card">
            {result.article.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.article.coverUrl} alt="" className="collect-cover" referrerPolicy="no-referrer" />
            )}
            <h2>{result.article.title_cn || result.article.title}</h2>
            <div className="collect-meta">
              {result.article.category && <span className="collect-badge">{result.article.category}</span>}
              <span className={`collect-badge ${scoreClass(result.article.relevance_score)}`}>
                {result.article.relevance_score === null ? '未评分' : `${result.article.relevance_score} 分`}
              </span>
            </div>
            {result.article.summary_cn && <p className="collect-summary">{result.article.summary_cn}</p>}
            {result.article.commentary && <p className="collect-commentary">💬 {result.article.commentary}</p>}
            {result.account?.name && (
              <p className="collect-source">
                来源：{result.account.name}
                {result.account.isResident || upgraded
                  ? <span className="collect-badge collect-score-high">常驻信息源</span>
                  : result.account.isNewSource
                    ? <span className="collect-badge collect-score-mid">新登记来源</span>
                    : <span className="collect-badge collect-score-mid">已登记来源</span>}
              </p>
            )}
          </article>

          <div className="collect-actions">
            <button className="collect-primary-btn" onClick={reset}>再收一篇</button>
            {result.account?.name && !result.account.isResident && !upgraded && result.account.sourceId && (
              <button className="collect-secondary-btn" onClick={() => setShowUpgrade((v) => !v)}>
                {showUpgrade ? '收起升级面板' : '升级为常驻信息源'}
              </button>
            )}
            <Link href="/" className="collect-secondary-btn collect-link-btn">回首页看看</Link>
          </div>

          {showUpgrade && result.account?.name && !upgraded && (
            <section className="collect-upgrade">
              <h3>把「{result.account.name}」升级为常驻信息源</h3>
              <ol>
                <li>打开 <a href="https://rss.laojia-ip.com" target="_blank" rel="noreferrer">rss.laojia-ip.com</a> 并登录</li>
                <li>搜索公众号「{result.account.name}」并订阅</li>
                <li>复制该号的 RSS 地址，粘贴到下面</li>
                <li>点「验证并启用」，系统会实抓验证</li>
              </ol>
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="粘贴 RSS 地址（https://…）"
              />
              {upgradeMessage && <p className="collect-error">{upgradeMessage}</p>}
              <button
                className="collect-primary-btn"
                onClick={handleUpgrade}
                disabled={upgradeBusy || !feedUrl.trim()}
              >
                {upgradeBusy ? '验证中…' : '验证并启用'}
              </button>
            </section>
          )}
          {upgraded && <p className="collect-upgraded">✅ {upgradeMessage}</p>}
        </section>
      )}
    </main>
  )
}
