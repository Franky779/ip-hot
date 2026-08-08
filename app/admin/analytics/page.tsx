'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdmin } from '../../components/AdminToggle'

type KPIData = {
  totalArticles: number
  weekNewArticles: number
  activeSources: number
  llmSelectRate: number
  totalArticlesChange: number
  weekNewChange: number
  activeSourcesChange: number
  llmSelectRateChange: number
}

type TrendPoint = { date: string; count: number }
type CatDist = { category: string; count: number }
type SourceRank = { name: string; count: number }
type Funnel = { fetched: number; translated: number; classified: number; scored: number; selected: number }
type Health = { healthy: number; warning: number; dead: number }
type Feedback = { content: string; createdAt: string }

type AnalyticsData = {
  kpi: KPIData
  dailyTrend: TrendPoint[]
  categoryDistribution: CatDist[]
  topSources: SourceRank[]
  llmFunnel: Funnel
  sourceHealth: Health
  recentFeedback: Feedback[]
}

function getPw() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ip-hot-admin-pw')
}

function fmt(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString('zh-CN')
}

function ChangeArrow({ pct }: { pct: number }) {
  if (pct === 0) return <span className="analytics-change-flat">→0%</span>
  if (pct > 0) return <span className="analytics-change-up">↑{pct}%</span>
  return <span className="analytics-change-down">↓{Math.abs(pct)}%</span>
}

// ---- SVG Line Chart ----
function LineChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <div className="analytics-empty">暂无数据</div>
  const W = 700, H = 220, PAD_L = 44, PAD_R = 16, PAD_T = 16, PAD_B = 28
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const maxCount = Math.max(...data.map((d) => d.count), 1)
  const yMax = Math.ceil(maxCount * 1.15)
  const ySteps = 4

  const x = (i: number) => PAD_L + (i / Math.max(data.length - 1, 1)) * plotW
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH

  const points = data.map((d, i) => `${x(i)},${y(d.count)}`).join(' ')
  const areaPath = `M${x(0)},${y(0)} ` + data.map((d, i) => `L${x(i)},${y(d.count)}`).join(' ') + ` L${x(data.length - 1)},${PAD_T + plotH} L${x(0)},${PAD_T + plotH} Z`

  // Show ~6 X labels
  const xLabelInterval = Math.max(1, Math.floor(data.length / 6))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="analytics-chart-svg" aria-label="30天文章增长趋势">
      {/* Grid lines */}
      {Array.from({ length: ySteps + 1 }, (_, i) => {
        const v = Math.round((yMax / ySteps) * i)
        const yPos = y(v)
        return (
          <g key={`grid-${i}`}>
            <line x1={PAD_L} y1={yPos} x2={W - PAD_R} y2={yPos} stroke="var(--border-light)" strokeWidth="1" />
            <text x={PAD_L - 6} y={yPos + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{v}</text>
          </g>
        )
      })}
      {/* Area fill */}
      <path d={areaPath} fill="var(--accent-light)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* X labels */}
      {data.map((d, i) => {
        if (i % xLabelInterval !== 0 && i !== data.length - 1) return null
        return (
          <text key={`xl-${i}`} x={x(i)} y={H - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
            {d.date.slice(5)}
          </text>
        )
      })}
    </svg>
  )
}

// ---- Horizontal Bar Chart ----
function BarChart({ data }: { data: CatDist[] }) {
  if (!data.length) return <div className="analytics-empty">暂无数据</div>
  const maxCount = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="analytics-bar-list">
      {data.map((d) => (
        <div key={d.category} className="analytics-bar-row">
          <span className="analytics-bar-label">{d.category}</span>
          <div className="analytics-bar-track">
            <div
              className="analytics-bar-fill"
              style={{ width: `${Math.max(2, (d.count / maxCount) * 100)}%` }}
            />
          </div>
          <span className="analytics-bar-count">{fmt(d.count)}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Donut Chart (SVG) ----
function Donut({ healthy, warning, dead }: Health) {
  const total = healthy + warning + dead
  if (total === 0) return <div className="analytics-empty">暂无数据</div>
  const r = 60, circ = 2 * Math.PI * r
  const hPct = healthy / total
  const wPct = warning / total
  const dPct = dead / total
  // stroke-dasharray: visible dash, gap
  const hDash = circ * hPct
  const wDash = circ * wPct
  const dDash = circ * dPct
  return (
    <div className="analytics-donut-wrap">
      <svg viewBox="0 0 160 160" className="analytics-donut-svg">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--border-light)" strokeWidth="16" />
        {/* Healthy segment starts at top (-90deg) */}
        <circle cx="80" cy="80" r={r} fill="none" stroke="#2e9d5a" strokeWidth="16"
          strokeDasharray={`${hDash} ${circ - hDash}`} strokeDashoffset="0"
          transform="rotate(-90 80 80)" strokeLinecap="butt" />
        {/* Warning starts after healthy */}
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e6a817" strokeWidth="16"
          strokeDasharray={`${wDash} ${circ - wDash}`} strokeDashoffset={-hDash}
          transform="rotate(-90 80 80)" strokeLinecap="butt" />
        {/* Dead starts after warning */}
        <circle cx="80" cy="80" r={r} fill="none" stroke="#e94560" strokeWidth="16"
          strokeDasharray={`${dDash} ${circ - dDash}`} strokeDashoffset={-(hDash + wDash)}
          transform="rotate(-90 80 80)" strokeLinecap="butt" />
        <text x="80" y="76" textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="700">{total}</text>
        <text x="80" y="96" textAnchor="middle" fill="var(--text-muted)" fontSize="12">信息源总数</text>
      </svg>
      <div className="analytics-donut-legend">
        <div className="analytics-legend-item"><span className="analytics-legend-dot" style={{ background: '#2e9d5a' }} />健康 {healthy}</div>
        <div className="analytics-legend-item"><span className="analytics-legend-dot" style={{ background: '#e6a817' }} />警告 {warning}</div>
        <div className="analytics-legend-item"><span className="analytics-legend-dot" style={{ background: '#e94560' }} />故障 {dead}</div>
      </div>
    </div>
  )
}

// ---- CSS Funnel ----
function Funnel({ data }: { data: Funnel }) {
  const stages = [
    { key: 'fetched', label: '系统抓取', value: data.fetched },
    { key: 'translated', label: 'AI 翻译', value: data.translated },
    { key: 'classified', label: 'AI 分类', value: data.classified },
    { key: 'scored', label: 'AI 评分', value: data.scored },
    { key: 'selected', label: '精选展示', value: data.selected },
  ]
  const maxV = Math.max(...stages.map((s) => s.value), 1)
  return (
    <div className="analytics-funnel">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / maxV) * 100)
        const loss = i > 0 ? stages[i - 1].value - s.value : 0
        return (
          <div key={s.key} className="analytics-funnel-row">
            <div className="analytics-funnel-label">{s.label}</div>
            <div className="analytics-funnel-track">
              <div
                className="analytics-funnel-bar"
                style={{ width: `${pct}%` }}
              >
                <span className="analytics-funnel-value">{fmt(s.value)}</span>
              </div>
            </div>
            {loss > 0 && <div className="analytics-funnel-loss">-{fmt(loss)}</div>}
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const { isAdmin, loaded } = useAdmin()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const pw = getPw()
    if (!pw) { setLoading(false); return }
    try {
      const res = await fetch('/api/admin/analytics', {
        cache: 'no-store',
        headers: { 'x-admin-password': pw },
      })
      if (res.ok) setData(await res.json())
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loaded) return
    void fetchData()
    const timer = setInterval(() => { void fetchData() }, 30000)
    return () => clearInterval(timer)
  }, [loaded, fetchData])

  if (!loaded) return <div className="admin-auth-hint">加载中…</div>
  if (!isAdmin) return <div className="admin-auth-hint">🔒 请先输入管理密码</div>
  if (loading) return <div className="admin-auth-hint">加载数据中…</div>
  if (!data) return <div className="admin-auth-hint">数据加载失败，请检查网络</div>

  const { kpi, dailyTrend, categoryDistribution, topSources, llmFunnel, sourceHealth, recentFeedback } = data

  return (
    <div className="analytics-page">
      <h1 className="analytics-page-title">数据分析</h1>
      <p className="analytics-page-subtitle">内容资产 · 分类结构 · 系统效能 · 来源健康</p>

      {/* ---- KPI Cards ---- */}
      <section className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-value">{fmt(kpi.totalArticles)}</div>
          <div className="analytics-kpi-label">总文章数</div>
          <div className="analytics-kpi-change"><ChangeArrow pct={kpi.totalArticlesChange} /> vs 上周</div>
        </div>
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-value">{fmt(kpi.weekNewArticles)}</div>
          <div className="analytics-kpi-label">本周新增</div>
          <div className="analytics-kpi-change"><ChangeArrow pct={kpi.weekNewChange} /> vs 上周</div>
        </div>
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-value">{kpi.activeSources}</div>
          <div className="analytics-kpi-label">活跃信息源</div>
          <div className="analytics-kpi-change">当前可用 / 总数 235</div>
        </div>
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-value">{kpi.llmSelectRate}%</div>
          <div className="analytics-kpi-label">LLM 精选率</div>
          <div className="analytics-kpi-change">AI 打标选中比例</div>
        </div>
      </section>

      {/* ---- 30-day Trend ---- */}
      <section className="analytics-section">
        <h2 className="analytics-section-title">📈 文章增长趋势（近30天）</h2>
        <LineChart data={dailyTrend} />
      </section>

      {/* ---- Category + Top Sources ---- */}
      <div className="analytics-two-col">
        <section className="analytics-section">
          <h2 className="analytics-section-title">📂 分类分布</h2>
          <BarChart data={categoryDistribution} />
        </section>
        <section className="analytics-section">
          <h2 className="analytics-section-title">🏆 信息源贡献 Top 10</h2>
          {topSources.length === 0 ? (
            <div className="analytics-empty">暂无数据</div>
          ) : (
            <ol className="analytics-source-rank">
              {topSources.map((s, i) => (
                <li key={s.name} className="analytics-source-rank-item">
                  <span className="analytics-source-rank-num">{i + 1}</span>
                  <span className="analytics-source-rank-name">{s.name}</span>
                  <span className="analytics-source-rank-count">{fmt(s.count)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* ---- LLM Funnel ---- */}
      <section className="analytics-section">
        <h2 className="analytics-section-title">🤖 LLM 处理漏斗</h2>
        <p className="analytics-section-desc">
          从系统抓取到精选展示，每一步都会过滤掉一些内容。漏斗越陡的地方，说明那一环需要关注。
        </p>
        <Funnel data={llmFunnel} />
      </section>

      {/* ---- Source Health ---- */}
      <section className="analytics-section">
        <h2 className="analytics-section-title">💚 信息源健康概览</h2>
        <Donut healthy={sourceHealth.healthy} warning={sourceHealth.warning} dead={sourceHealth.dead} />
      </section>

      {/* ---- Recent Feedback ---- */}
      <section className="analytics-section">
        <h2 className="analytics-section-title">📝 用户反馈摘要</h2>
        {recentFeedback.length === 0 ? (
          <p className="analytics-empty">暂无反馈</p>
        ) : (
          <ul className="analytics-feedback-list">
            {recentFeedback.map((fb, i) => (
              <li key={i} className="analytics-feedback-item">
                <p className="analytics-feedback-content">{fb.content}</p>
                <time className="analytics-feedback-time">
                  {new Date(fb.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
