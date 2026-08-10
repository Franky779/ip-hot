// lib/wechat-article.ts — 微信公众号文章抓取与解析（随手收功能）
// 直连 mp.weixin.qq.com 用 cheerio 解析；被拦/解析失败时兜底 r.jina.ai（markdown）

import * as cheerio from 'cheerio'
import { normalizeImageUrl } from './article-image.ts'

export type WechatFetchErrorKind = 'invalid_url' | 'deleted' | 'blocked' | 'fetch_failed' | 'parse_failed'

export class WechatFetchError extends Error {
  kind: WechatFetchErrorKind
  constructor(kind: WechatFetchErrorKind, message: string) {
    super(message)
    this.name = 'WechatFetchError'
    this.kind = kind
  }
}

export type WechatArticle = {
  title: string
  accountName: string | null
  publishedAt: string | null
  content: string
  coverUrl: string | null
  fetchVia: 'direct' | 'jina'
}

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const CONTENT_MAX_LENGTH = 8000
/** 微信文章链接的固定参数，其余（chksm/scene/srcid 等会话追踪参数）一律丢弃以保证去重稳定 */
const WECHAT_KEEP_PARAMS = ['__biz', 'mid', 'idx', 'sn']

const DELETED_PATTERNS = ['该内容已被发布者删除', '内容已被发布者删除', '此内容因违规无法查看', '该公众号已被封禁', '链接已过期', '参数错误']
const BLOCKED_PATTERNS = ['环境异常', '操作频繁', '请在微信客户端打开', '完成验证', '访问过于频繁']

/** 从整段粘贴文本中提取并规范化微信文章链接；非微信链接返回 null */
export function extractWechatUrl(text: string): string | null {
  if (!text) return null
  const match = text.match(/https?:\/\/mp\.weixin\.qq\.com\/[^\s<>"'）)】\]，。；！？]+/)
  if (!match) return null
  try {
    const url = new URL(match[0])
    if (url.hostname !== 'mp.weixin.qq.com') return null
    url.protocol = 'https:'
    url.hash = ''
    if (url.pathname === '/s' || url.pathname.startsWith('/s/')) {
      if (url.pathname === '/s') {
        // 长参数形式：只保留定位文章的固定参数
        const kept = new URLSearchParams()
        for (const key of WECHAT_KEEP_PARAMS) {
          const value = url.searchParams.get(key)
          if (value) kept.set(key, value)
        }
        if (!kept.get('__biz') || !kept.get('mid') || !kept.get('sn')) return null
        url.search = kept.toString()
      } else {
        // 短路径形式：query 均为追踪参数
        url.search = ''
      }
      return url.toString()
    }
    return null
  } catch {
    return null
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

/** 解析「2026年8月9日 08:00」或「2026-08-09 08:00」，按北京时间构造 ISO；失败返回 null */
function parseWechatTime(raw: string): string | null {
  const text = raw.trim()
  const chinese = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/)
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/)
  const m = chinese ?? iso
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0'] = m
  const pad = (v: string) => v.padStart(2, '0')
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00+08:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 从脚本变量里兜底发布时间（var ct = "1723176000" 秒级时间戳） */
function extractCreateTime(html: string): string | null {
  const match = html.match(/var\s+ct\s*=\s*"(\d{9,11})"/) ?? html.match(/createTime\s*[:=]\s*["']?(\d{9,11})/)
  if (!match) return null
  const seconds = Number(match[1])
  if (!Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

/** 从 HTML 解析微信文章字段（纯函数，便于测试）。标题/正文缺失抛类型化错误 */
export function parseWechatHtml(html: string): Omit<WechatArticle, 'fetchVia'> {
  const $ = cheerio.load(html)

  const title = collapseWhitespace(
    $('#activity-name').text()
    || $('meta[property="og:title"]').attr('content')
    || $('title').text()
  )

  if (!title) {
    if (DELETED_PATTERNS.some((p) => html.includes(p))) {
      throw new WechatFetchError('deleted', '文章已被删除、违规不可见或链接已过期')
    }
    if (BLOCKED_PATTERNS.some((p) => html.includes(p))) {
      throw new WechatFetchError('blocked', '微信拦截了服务器访问（环境异常/需验证）')
    }
    throw new WechatFetchError('parse_failed', '未能从页面解析出标题')
  }

  const accountName = collapseWhitespace(
    $('#js_name').text()
    || $('.profile_nickname').first().text()
  ) || null

  const publishedAt = parseWechatTime($('#publish_time').text())
    ?? parseWechatTime($('meta[property="og:release_date"]').attr('content') ?? '')
    ?? extractCreateTime(html)

  const contentRoot = $('#js_content')
  if (contentRoot.length === 0 && !$('#activity-name').length) {
    throw new WechatFetchError('parse_failed', '未能从页面解析出正文结构')
  }
  const content = collapseWhitespace(contentRoot.text()).slice(0, CONTENT_MAX_LENGTH)

  const coverUrl = normalizeImageUrl(
    $('meta[property="og:image"]').attr('content')
    || contentRoot.find('img').first().attr('data-src')
    || ''
  )

  return { title, accountName, publishedAt, content, coverUrl }
}

/** 解析 r.jina.ai 返回的 markdown（兜底通道） */
function parseJinaMarkdown(markdown: string): Omit<WechatArticle, 'fetchVia'> {
  const titleLine = markdown.split('\n').map((l) => l.trim()).find((l) => l.startsWith('# '))
  const title = titleLine ? collapseWhitespace(titleLine.slice(2)) : ''
  if (!title) throw new WechatFetchError('parse_failed', 'jina 兜底通道未能解析出标题')
  if (DELETED_PATTERNS.some((p) => markdown.includes(p))) {
    throw new WechatFetchError('deleted', '文章已被删除、违规不可见或链接已过期')
  }
  const content = markdown.replace(/\n{3,}/g, '\n\n').trim().slice(0, CONTENT_MAX_LENGTH)
  const coverMatch = markdown.match(/!\[[^\]]*\]\((https?:\/\/mmbiz[^)\s]+)/)
  return {
    title,
    accountName: null,
    publishedAt: null,
    content,
    coverUrl: coverMatch ? normalizeImageUrl(coverMatch[1]) : null,
  }
}

async function fetchText(url: string, timeoutMs: number, ua: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': ua },
    })
    if (!response.ok) throw new WechatFetchError('fetch_failed', `HTTP ${response.status}`)
    return await response.text()
  } catch (error) {
    if (error instanceof WechatFetchError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new WechatFetchError('fetch_failed', message)
  } finally {
    clearTimeout(timer)
  }
}

/** 抓取微信文章：直连优先，被拦/解析失败时兜底 r.jina.ai */
export async function fetchWechatArticle(rawUrl: string): Promise<WechatArticle> {
  const url = extractWechatUrl(rawUrl)
  if (!url) throw new WechatFetchError('invalid_url', '不是有效的微信文章链接')

  try {
    const html = await fetchText(url, 20_000, DESKTOP_UA)
    return { ...parseWechatHtml(html), fetchVia: 'direct' }
  } catch (directError) {
    if (directError instanceof WechatFetchError && (directError.kind === 'deleted' || directError.kind === 'invalid_url')) {
      throw directError
    }
    // blocked / fetch_failed / parse_failed → 走 jina 兜底
    try {
      const markdown = await fetchText(`https://r.jina.ai/${url}`, 25_000, 'Mozilla/5.0')
      return { ...parseJinaMarkdown(markdown), fetchVia: 'jina' }
    } catch (jinaError) {
      if (jinaError instanceof WechatFetchError && jinaError.kind === 'deleted') throw jinaError
      throw directError instanceof WechatFetchError
        ? directError
        : new WechatFetchError('fetch_failed', String(directError))
    }
  }
}
