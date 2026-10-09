#!/usr/bin/env node
/**
 * laojia.mjs — 老贾 IP（laojia-ip.com）Agent CLI
 *
 * 单文件、零依赖，Node 18+ 直接运行。
 *
 * 权限分级：
 *   级别 1｜匿名只读 —— 不需要密码，读取公开数据（文章/热点/信息源/RSS/页面），限流 40 次/分钟。
 *   级别 2｜管理员全权 —— 设置环境变量 LAOJIA_ADMIN_PASSWORD（或 --password 参数，不建议），
 *                         可调用全部 /api/admin/* 管理接口：读、增、改、删。
 *
 * 安装：
 *   curl -fsSL -o laojia.mjs https://www.laojia-ip.com/cli/laojia.mjs
 *   node laojia.mjs help
 *
 * 管理员（仅站长本人）：
 *   export LAOJIA_ADMIN_PASSWORD='你的管理员密码'   # 只放本机环境变量，不要写进任何文件
 *   node laojia.mjs whoami                          # 验证密码是否有效
 *   node laojia.mjs admin GET /api/admin/monitor    # 任意 /api/admin/* 接口
 */

import { stdin, stdout, env, argv } from 'node:process'

const DEFAULT_SITE = 'https://www.laojia-ip.com'
const UA = 'laojia-cli/1.0.0 (agent; +https://www.laojia-ip.com)'

// ---------- 参数解析 ----------

function parseArgs(raw) {
  const opts = { _: [] }
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '--site') opts.site = raw[++i]
    else if (a === '--password') opts.password = raw[++i]
    else if (a === '--body') opts.body = raw[++i]
    else if (a === '--limit') opts.limit = raw[++i]
    else if (a === '--category') opts.category = raw[++i]
    else if (a === '--name') opts.name = raw[++i]
    else if (a === '--json') opts.json = true
    else opts._.push(a)
  }
  return opts
}

function printHelp() {
  stdout.write(`
老贾 IP CLI（laojia-ip.com）— 权限分两级

【级别 1｜匿名只读】（无需密码，限流 40 次/分钟）
  node laojia.mjs articles [--limit 20] [--category 授权联名]   精选文章（摘要+原文链接）
  node laojia.mjs hot [--limit 20]                              本周热点事件榜
  node laojia.mjs sources                                       信息源列表
  node laojia.mjs site-pages                                    站点页面列表
  node laojia.mjs feed [--name all|daily|period]                RSS（默认精选 50 条）

【级别 2｜管理员全权】（需环境变量 LAOJIA_ADMIN_PASSWORD）
  node laojia.mjs whoami                                        验证管理员密码
  node laojia.mjs admin <METHOD> <path> [--body '{"json":...}'] 调用任意 /api/admin/* 接口
      METHOD: GET | POST | PUT | PATCH | DELETE
      path:   以 /api/admin/ 开头，例如 /api/admin/pending-articles
      常用接口举例：
        GET  /api/admin/monitor              运营监控总览
        GET  /api/admin/pending-articles     待分类/待处理文章
        POST /api/admin/article-update       {"id":"...","title_cn":"..."}   编辑文章
        POST /api/admin/article-delete       {"id":"..."}                    删除文章（危险）
        POST /api/admin/events/action        热点事件人工修正（move/rename/firstParty/hide）
        POST /api/admin/sources              新增信息源
        PATCH /api/admin/sources             修改信息源
        GET/PUT /api/admin/talks             talks 栏目 JSON（PUT 为全量覆盖，先 GET 再改）
        GET/POST /api/admin/llm-budget       LLM 用量/预算
        其他 /api/admin/* 接口均可通过本命令调用。

【全局选项】
  --site <url>       覆盖基础地址（默认 https://www.laojia-ip.com）
  --json             原样输出 JSON（不加美化缩进）
  --password <pwd>   临时指定管理员密码（不安全，优先用环境变量）

【安全提示】
  密码只放本机环境变量 LAOJIA_ADMIN_PASSWORD；删除/批量操作前先查询确认目标，
  CLI 不会替你二次确认——agent 使用时应遵循「先读后写、删除先请示」。
`)
}

function die(msg, code = 1) {
  stdout.write(`错误：${msg}\n`)
  process.exit(code)
}

// ---------- 请求封装 ----------

async function apiFetch(site, path, { method = 'GET', body, password } = {}) {
  const headers = { 'user-agent': UA, accept: 'application/json' }
  if (password) headers['x-admin-password'] = password
  const init = { method, headers }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(`${site.replace(/\/+$/, '')}${path}`, init)
  } catch (e) {
    die(`网络请求失败：${e.message}（检查网络或 --site 地址）`)
  }
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 2000) }
  }
  if (res.status === 401 || res.status === 403) {
    die(`鉴权失败（HTTP ${res.status}）：管理员密码缺失或错误。请设置环境变量 LAOJIA_ADMIN_PASSWORD 后重试，不要反复猜密码。`, 2)
  }
  if (res.status === 429) {
    die('触发限流（40 次/分钟），请等待 60 秒后再试。', 3)
  }
  if (!res.ok) {
    die(`HTTP ${res.status}：${JSON.stringify(data).slice(0, 800)}`, res.status)
  }
  return data
}

// ---------- 主入口 ----------

const opts = parseArgs(argv.slice(2))
const [cmd, ...rest] = opts._
const site = opts.site || DEFAULT_SITE
const password = opts.password || env.LAOJIA_ADMIN_PASSWORD || ''

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp()
  process.exit(0)
}

const out = (data) => stdout.write((opts.json ? JSON.stringify(data) : JSON.stringify(data, null, 2)) + '\n')

try {
  switch (cmd) {
    // ===== 级别 1：匿名只读 =====
    case 'articles': {
      const p = new URLSearchParams()
      if (opts.limit) p.set('limit', String(opts.limit))
      if (opts.category) p.set('category', opts.category)
      out(await apiFetch(site, `/api/v1/articles?${p}`))
      break
    }
    case 'hot': {
      const p = new URLSearchParams()
      if (opts.limit) p.set('limit', String(opts.limit))
      out(await apiFetch(site, `/api/v1/hot?${p}`))
      break
    }
    case 'sources':
      out(await apiFetch(site, '/api/sources'))
      break
    case 'site-pages':
      out(await apiFetch(site, '/api/site-pages'))
      break
    case 'feed': {
      const name = opts.name || ''
      if (name && !['all', 'daily', 'period'].includes(name)) die('--name 只支持 all | daily | period')
      const res = await fetch(`${site.replace(/\/+$/, '')}/feed/${name ? name + '.' : ''}xml`, { headers: { 'user-agent': UA } })
      stdout.write(await res.text() + '\n')
      break
    }

    // ===== 级别 2：管理员全权 =====
    case 'whoami': {
      if (!password) die('未提供管理员密码：请 export LAOJIA_ADMIN_PASSWORD=... 后重试。')
      const data = await apiFetch(site, '/api/admin/monitor', { password })
      out({ ok: true, message: '管理员密码有效（级别 2 全权模式）', monitor_keys: Object.keys(data) })
      break
    }
    case 'admin': {
      const [methodRaw, pathRaw] = rest
      const method = (methodRaw || '').toUpperCase()
      // 兼容 Windows Git Bash 的 MSYS 路径转换：/api/admin/x 可能被改写成 C:/Program Files/Git/api/admin/x
      // 统一从 /api/admin/ 处截断归一
      const idx = (pathRaw || '').indexOf('/api/admin/')
      if (idx === -1) die('用法：node laojia.mjs admin <GET|POST|PUT|PATCH|DELETE> /api/admin/...（路径必须包含 /api/admin/）')
      const path = (pathRaw || '').slice(idx)
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) die('用法：node laojia.mjs admin <GET|POST|PUT|PATCH|DELETE> /api/admin/... [--body JSON]')
      if (!password) die('未提供管理员密码：请 export LAOJIA_ADMIN_PASSWORD=... 后重试。')
      if (opts.body !== undefined) {
        try { JSON.parse(opts.body) } catch { die('--body 不是合法 JSON：' + opts.body.slice(0, 120)) }
      }
      out(await apiFetch(site, path, { method, body: opts.body, password }))
      break
    }
    default:
      die(`未知命令：${cmd}。执行 node laojia.mjs help 查看全部命令。`)
  }
} catch (e) {
  die(e.message)
}
