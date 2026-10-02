import { createServiceClient } from './supabase'
import { limitUnknownDateItems, type UnknownDateItem } from './article-time'

/**
 * A7 旧文不刷屏闸门：只对该来源"首次导入"（库中还没有该源的任何文章）时生效。
 * - 首次导入的无日期条目限量放行，防止新信源的历史存量把首页冲掉；
 * - 已有文章的常驻源不限制——时间线类抓取源每轮产出的无日期条目本来就是新内容；
 * - 数据库查询失败时放行全部（宁多勿漏，文章还有 LLM 筛选兜底）。
 */
export async function gateUnknownDateItems<T extends UnknownDateItem>(
  supabase: ReturnType<typeof createServiceClient>,
  sourceName: string,
  items: T[],
): Promise<{ items: T[]; dropped: number }> {
  if (items.length === 0 || !items.some((item) => !item.published_at)) {
    return { items, dropped: 0 }
  }

  let isFirstImport = false
  try {
    const { count, error } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('source', sourceName)
    if (error) throw new Error(error.message)
    isFirstImport = (count ?? 0) === 0
  } catch (e) {
    console.error('[A7] 查询来源文章数失败，跳过限量闸门:', e instanceof Error ? e.message : String(e))
    return { items, dropped: 0 }
  }

  if (!isFirstImport) return { items, dropped: 0 }

  const limited = limitUnknownDateItems(items)
  return { items: limited.kept, dropped: limited.dropped }
}
