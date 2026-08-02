import type { NewsSource } from './sources.ts'
import { parseFeedUrl } from './rss.ts'
import { scrapeNewsList } from './scraper.ts'
import { getSourceSchedule, writeSourceSchedule } from './source-schedule.ts'

export type RepairCandidate = {
  id: string
  name: string
  url: string
  type: string | null
  method: string | null
  fetch_type: string | null
  enabled: boolean
  last_test_status: string
  last_test_message: string
}

export type RepairTestResult = {
  ok: boolean
  itemCount: number
  message: string
}

export type RepairDecision =
  | { action: 'test' }
  | { action: 'skip'; reason: string }

/** 只有因测试失败被自动停用的源才允许自动修复重新启用。 */
export function isRepairCandidate(candidate: Pick<RepairCandidate, 'enabled' | 'last_test_status'>): boolean {
  return candidate.enabled === false && candidate.last_test_status === 'failed'
}

/** 服务器环境无法验证的源保持停用，绝不自动启用。 */
export function decideRepairAction(
  candidate: Pick<RepairCandidate, 'url'>,
  configured: NewsSource | undefined,
): RepairDecision {
  if (!candidate.url || !candidate.url.startsWith('http')) {
    return { action: 'skip', reason: '信息源 URL 无效，无法自动修复。' }
  }
  if (configured?.needsLocalCdp) {
    return { action: 'skip', reason: '本地 CDP 源无法在服务器环境自动测试，保持停用。' }
  }
  if (configured?.loginRequired) {
    return { action: 'skip', reason: '登录源无法自动测试，保持停用。' }
  }
  if (configured?.localCdpDisabledReason) {
    return { action: 'skip', reason: configured.localCdpDisabledReason }
  }
  return { action: 'test' }
}

export function effectiveFetchType(
  candidate: Pick<RepairCandidate, 'fetch_type'>,
  configured: NewsSource | undefined,
): 'rss' | 'web' {
  if (configured) {
    return configured.type === 'rss' || configured.isRss ? 'rss' : 'web'
  }
  return candidate.fetch_type === 'rss' ? 'rss' : 'web'
}

/**
 * 重新启用时把代码里的已验证配置同步回数据库 method，但保留已有调度槽位，
 * 与运营监控的“恢复启用”操作行为一致。
 */
export function syncMethod(
  currentMethod: string | null,
  configured: NewsSource | undefined,
): string | null {
  if (!configured) return null
  const schedule = getSourceSchedule({
    enabled: true,
    type: configured.type,
    priority: configured.priority,
    needsLocalCdp: configured.needsLocalCdp,
    loginRequired: configured.loginRequired,
    method: currentMethod,
  })
  let executionMode = schedule.executionMode
  if (configured.needsLocalCdp) {
    executionMode = 'local'
  } else if (configured.loginRequired) {
    executionMode = 'manual'
  } else if (executionMode === 'paused') {
    executionMode = 'cloud'
  }
  return writeSourceSchedule(currentMethod, { ...schedule, executionMode })
}

/** 与信息源管理页“测试”按钮同一套真实测试逻辑，可被定时任务复用。 */
export async function runSourceTest(
  candidate: Pick<RepairCandidate, 'name' | 'url' | 'fetch_type'>,
  configured: NewsSource | undefined,
): Promise<RepairTestResult> {
  const effectiveUrl = configured?.url || candidate.url
  const fetchType = effectiveFetchType(candidate, configured)

  try {
    if (fetchType === 'rss') {
      const feed = await parseFeedUrl(effectiveUrl)
      const itemCount = feed.items.filter((item) => item.title && item.link).length
      return itemCount > 0
        ? { ok: true, itemCount, message: '读取成功，共发现 ' + itemCount + ' 条资讯。' }
        : { ok: false, itemCount: 0, message: 'RSS 可访问，但没有发现有效资讯。' }
    }

    const scrapeConfig = configured?.scrapeConfig || {
      adapter: 'auto-news-links' as const,
      maxItems: 10,
    }
    const result = await scrapeNewsList(candidate.name, effectiveUrl, scrapeConfig)
    return result.items.length > 0
      ? { ok: true, itemCount: result.items.length, message: result.error || '读取成功，共发现 ' + result.items.length + ' 条资讯。' }
      : { ok: false, itemCount: 0, message: result.error || '未提取到有效资讯。' }
  } catch (error) {
    return {
      ok: false,
      itemCount: 0,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
