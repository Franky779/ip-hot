'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AdminToggle, useAdmin } from '../components/AdminToggle'

const SITE = 'https://www.laojia-ip.com'
const SKILL_URL = `${SITE}/skill/LAOJIA-IP-SKILL.md`
const CLI_URL = `${SITE}/cli/laojia.mjs`
const PROMPT_URL = `${SITE}/cli/FULL-ACCESS-PROMPT.md`
const LLMS_URL = `${SITE}/llms.txt`

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="agent-copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function CopyBlock({ title, code, lang }: { title: string; code: string; lang?: string }) {
  return (
    <div className="agent-copy-block">
      <div className="agent-copy-head">
        <span>{title}</span>
        <span className="agent-copy-meta">
          {lang && <code className="agent-lang-tag">{lang}</code>}
          <CopyButton text={code} />
        </span>
      </div>
      <pre>{code}</pre>
    </div>
  )
}

const EXAMPLE_QUESTIONS = [
  '现在最热的授权联名是什么？',
  '本周热点榜前 5 件事',
  '最新一期日报讲了什么？',
  '订阅更新用哪个 RSS 地址？',
]

export default function AgentPage() {
  const { isAdmin, loaded } = useAdmin()

  if (!loaded) return <div className="agent-page agent-loading" />

  if (!isAdmin) {
    return (
      <div className="agent-page">
        <div className="agent-locked">
          <div className="agent-locked-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="agent-title">需要管理员身份</h1>
          <p className="agent-locked-text">
            「Agent 接入」页面只在管理员登录后显示。请在左下角的管理入口登录后刷新本页。
          </p>
          <AdminToggle />
        </div>
      </div>
    )
  }

  return (
    <div className="agent-page">
      <header className="agent-header">
        <p className="agent-kicker">— Agent 接入</p>
        <h1 className="agent-title">把 laojia-ip 接进你的 Agent</h1>
        <p className="agent-subtitle">
          Skill、CLI、RSS、API 四种方式读的是同一份数据：精选文章、热点、日报、周报和月报。
          按你用的工具选一种就行。全站匿名只读，不用注册，也不用 API Key。
        </p>
        <div className="agent-badges">
          <span className="agent-badge agent-badge-ok">
            <span className="agent-badge-dot" />
            服务正常
          </span>
          <span className="agent-badge">版本 2.0.0</span>
          <span className="agent-badge">匿名只读 · 无需 Key</span>
        </div>
        <div className="agent-notice">
          <span className="agent-notice-text">
            级别 2｜管理员 CLI 可全权读写全站（增、删、改），密码只放本机环境变量，绝不写进文件或聊天记录。
          </span>
          <a className="agent-notice-btn" href={PROMPT_URL} target="_blank" rel="noopener noreferrer">
            查看全权提示 →
          </a>
        </div>
      </header>

      <section className="agent-cards">
        <article className="agent-card agent-card-recommended">
          <span className="agent-card-tag">推荐</span>
          <span className="agent-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
            </svg>
          </span>
          <h3 className="agent-card-title">Agent Skill</h3>
          <p className="agent-card-desc">
            装一次，以后不用再更新。
            <br />
            Claude Code、Codex、Gemini CLI、OpenCode
          </p>
        </article>
        <article className="agent-card">
          <span className="agent-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </span>
          <h3 className="agent-card-title">CLI 管理工具</h3>
          <p className="agent-card-desc">
            管理员全权，一条命令读写全站。
            <br />
            单文件零依赖，Node 18+
          </p>
        </article>
        <article className="agent-card">
          <span className="agent-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" />
            </svg>
          </span>
          <h3 className="agent-card-title">RSS 订阅</h3>
          <p className="agent-card-desc">
            复制地址，用阅读器订阅。
            <br />
            Folo、Inoreader、n8n
          </p>
        </article>
        <article className="agent-card">
          <span className="agent-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
            </svg>
          </span>
          <h3 className="agent-card-title">公开 API v1</h3>
          <p className="agent-card-desc">
            匿名 GET，自己写程序取数。
            <br />
            限流 40 次/分 · 持密码不限流
          </p>
        </article>
        <p className="agent-cards-note">
          下面复制出去的命令不带任何密码；管理员密码只放你本机的环境变量{' '}
          <code>LAOJIA_ADMIN_PASSWORD</code>
          ，怀疑泄露就换服务器密码，旧密码即刻作废。
        </p>
      </section>

      <div className="agent-columns">
        <main className="agent-main">
          <section id="agent-skill" className="agent-section">
            <p className="agent-section-kicker">AGENT SKILL · 2.0.0</p>
            <h2 className="agent-section-title">装一次，以后不用再更新</h2>
            <p className="agent-section-text">
              不用记接口，也不用写代码。适合 Claude Code、Codex、Gemini CLI、OpenCode
              这类支持 Agent Skills 的工具。查热点、查文章、订阅日报都在站点侧完成，Skill
              只负责提问和转述；站点以后新增的能力，装好的 Skill 会自动用上。
            </p>
            <CopyBlock
              title="把这段话发给你的 Agent"
              lang="text"
              code={`请安装 laojia-ip Skill：${SKILL_URL}\n装完告诉我是否需要开启新会话。`}
            />
            <h3 className="agent-sub-heading">开一个新会话</h3>
            <p className="agent-section-text">
              多数 Agent 只在会话开始时读取 Skill，当前对话里不一定看得到。
            </p>
            <h3 className="agent-sub-heading">问一句试试</h3>
            <p className="agent-section-text">
              能答上「现在最热的授权联名是什么？」并给出带链接的中文摘要，就是装好了。示例：
            </p>
            <ul className="agent-question-list">
              {EXAMPLE_QUESTIONS.map((q) => (
                <li key={q}>
                  <span>{q}</span>
                  <CopyButton text={q} />
                </li>
              ))}
            </ul>
          </section>

          <section id="cli" className="agent-section">
            <p className="agent-section-kicker">CLI · 管理员</p>
            <h2 className="agent-section-title">站长的全权命令行</h2>
            <p className="agent-section-text">
              读、增、改、删全站内容：文章、热点、信息源、案例库、品牌库。单文件零依赖，Node
              18+ 直接跑。
            </p>
            <CopyBlock
              title="下载并查看帮助"
              lang="bash"
              code={`curl -fsSL -o laojia.mjs ${CLI_URL}\nnode laojia.mjs help`}
            />
            <CopyBlock
              title="管理员鉴权（级别 2）"
              lang="bash"
              code={`export LAOJIA_ADMIN_PASSWORD='<向我询问，只放本机>'\nnode laojia.mjs whoami\nnode laojia.mjs admin GET /api/admin/monitor`}
            />
            <p className="agent-section-note">
              删除/批量操作执行前必须先列清单确认——完整纪律见
              <a href={PROMPT_URL} target="_blank" rel="noopener noreferrer">
                全权安装提示
              </a>
              。
            </p>
          </section>

          <section id="rss" className="agent-section">
            <p className="agent-section-kicker">RSS</p>
            <h2 className="agent-section-title">四个订阅地址</h2>
            <ul className="agent-rss-list">
              <li>
                <code>{SITE}/feed.xml</code>
                <span>精选 50 条</span>
                <CopyButton text={`${SITE}/feed.xml`} />
              </li>
              <li>
                <code>{SITE}/feed/all.xml</code>
                <span>全部 100 条</span>
                <CopyButton text={`${SITE}/feed/all.xml`} />
              </li>
              <li>
                <code>{SITE}/feed/daily.xml</code>
                <span>日报 30 期</span>
                <CopyButton text={`${SITE}/feed/daily.xml`} />
              </li>
              <li>
                <code>{SITE}/feed/period.xml</code>
                <span>周报 + 月报</span>
                <CopyButton text={`${SITE}/feed/period.xml`} />
              </li>
            </ul>
          </section>

          <section id="api" className="agent-section">
            <p className="agent-section-kicker">公开 API · v1</p>
            <h2 className="agent-section-title">匿名 GET，自己写程序</h2>
            <ul className="agent-rss-list">
              <li>
                <code>{SITE}/api/v1/hot?limit=20</code>
                <span>本周热点事件榜</span>
                <CopyButton text={`${SITE}/api/v1/hot?limit=20`} />
              </li>
              <li>
                <code>{SITE}/api/v1/articles?limit=20</code>
                <span>精选文章（摘要 + 原文链接）</span>
                <CopyButton text={`${SITE}/api/v1/articles?limit=20`} />
              </li>
              <li>
                <code>{SITE}/api/sources</code>
                <span>信息源列表</span>
                <CopyButton text={`${SITE}/api/sources`} />
              </li>
            </ul>
            <p className="agent-section-note">
              匿名限流 40 次/分钟/IP，超了等 60 秒；带管理员密码的请求不限流。
            </p>
          </section>

          <section className="agent-section">
            <h2 className="agent-section-title">没装上？</h2>
            <ol className="agent-steps-list">
              <li>文件名严格是 SKILL.md，且在 Agent 支持的 skills 目录里。</li>
              <li>关掉旧会话，新开一个，再问上面的验证问题。</li>
              <li>让 Agent 列出它发现的 skills，确认里面有 laojia-ip。</li>
              <li>
                还是不行：把平台、版本和报错写到
                <Link href="/feedback">反馈页</Link>
                ，别发密码或本机文件。
              </li>
            </ol>
          </section>

          <section className="agent-section agent-capabilities">
            <div>
              <h2 className="agent-section-title">能做到的</h2>
              <ul className="agent-cap-list">
                <li>匿名读全站公开数据，不用注册、不用 Key。</li>
                <li>管理员持密码全权增删改查全站内容。</li>
                <li>RSS 和公开 API 在限流内自由使用。</li>
              </ul>
            </div>
            <div>
              <h2 className="agent-section-title">做不到的</h2>
              <ul className="agent-cap-list agent-cap-list-no">
                <li>匿名写入——任何写操作都要管理员密码。</li>
                <li>绕过匿名 40 次/分钟的限流。</li>
                <li>触及服务器系统层（进程、Nginx、SSH）。</li>
              </ul>
            </div>
          </section>
        </main>

        <aside className="agent-aside">
          <div className="agent-aside-card">
            <h3 className="agent-aside-title">接入方式</h3>
            <nav className="agent-aside-nav">
              <a href="#agent-skill" className="agent-aside-link agent-aside-link-active">
                <span className="agent-aside-dot" />
                Agent Skill
              </a>
              <a href="#cli" className="agent-aside-link">
                CLI 管理工具
              </a>
              <a href="#rss" className="agent-aside-link">
                RSS
              </a>
              <a href="#api" className="agent-aside-link">
                公开 API
              </a>
            </nav>
          </div>
          <div className="agent-aside-card">
            <h3 className="agent-aside-title">接入资源</h3>
            <nav className="agent-aside-nav">
              <a className="agent-aside-link" href={LLMS_URL} target="_blank" rel="noopener noreferrer">
                llms.txt
                <span className="agent-aside-sub">给大模型的站点说明</span>
              </a>
              <a className="agent-aside-link" href={SKILL_URL} target="_blank" rel="noopener noreferrer">
                SKILL.md
                <span className="agent-aside-sub">Agent Skill 完整文件</span>
              </a>
              <a className="agent-aside-link" href={CLI_URL} target="_blank" rel="noopener noreferrer">
                CLI 完整包
                <span className="agent-aside-sub">单文件 · 零依赖</span>
              </a>
              <a className="agent-aside-link" href={PROMPT_URL} target="_blank" rel="noopener noreferrer">
                全权安装提示
                <span className="agent-aside-sub">级别 2 · 站长专用</span>
              </a>
              <a
                className="agent-aside-link"
                href="https://github.com/Franky779/ip-hot"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub 镜像
                <span className="agent-aside-sub">仓库源码</span>
              </a>
            </nav>
          </div>
          <div className="agent-aside-card">
            <h3 className="agent-aside-title">连不上？</h3>
            <p className="agent-aside-text">
              把平台、版本和报错写在反馈页。别发密码或本机文件。
            </p>
            <Link href="/feedback" className="agent-aside-feedback">
              去反馈 →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
