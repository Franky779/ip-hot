import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findSourceConfiguration } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'

export const runtime = 'nodejs'
export const maxDuration = 300

const TOKEN = 'repair-20260719-7f69ac1d-983c-4d8e-a86d-29d30969e0b3'

const updates = [
  ['d741a21f-7765-4f24-87c8-028722c99d51', 'https://www.huxiu.com/', 'web', '第一方 JSON API: article-api.huxiu.com/web/channel/articleList'],
  ['0dcc126f-86ea-4c82-9c3e-761706f41dd4', 'https://www.ynet.com', 'web', '静态 HTML: a[href*="ynet.com/20"]'],
  ['638ef624-5075-4412-9dd2-7705833ffcca', 'https://www.ynet.com', 'web', '静态 HTML: a[href*="ynet.com/20"]'],
  ['a8195027-bc3d-4a40-9b47-0226afa699f6', 'https://www.cdsb.com', 'web', '静态 HTML: a[href*="/micropub/Articles/"]'],
  ['096e3b67-fb58-4e73-b1b3-cbdfcaef80b4', 'https://www.cdsb.com', 'web', '静态 HTML: a[href*="/micropub/Articles/"]'],
  ['50da1da3-9b19-4896-b828-22e662a60423', 'https://www.gov.cn/zhengce/zhengceku/bmwj/home.htm', 'web', '国务院部门政策文件列表'],
  ['8f55886d-4b8f-430d-8057-85058fb6a53a', 'https://www.mct.gov.cn/whzx/qgwhxxlb/zj/', 'web', '文化和旅游部浙江官方栏目'],
  ['3b995c35-db20-4f3a-a384-5fa6c12f5014', 'https://wglt.dg.gov.cn/', 'web', '东莞市文化广电旅游体育局官方列表'],
  ['c157d66f-aafd-47f6-8dcb-c71c553ee48d', 'https://www.hzxh.gov.cn/', 'web', '官网 WAF：本地 CDP 抓取'],
  ['b9e6ebee-124d-44c2-a4ed-3f1a352c1b51', 'https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/', 'web', '财政部政策发布列表'],
  ['79f5e7c2-caa9-4f65-ba72-f5b4cb27c65e', 'https://whly.tj.gov.cn/', 'web', '天津市文化和旅游局官方列表'],
  ['150f959d-bd63-4252-9118-4f240a26aaad', 'https://www.mct.gov.cn/whzx/qgwhxxlb/gs/', 'web', '文化和旅游部甘肃官方栏目'],
  ['4a202749-9553-454b-aab0-0974ca2aa4c4', 'https://www.jiemian.com/account/2079.html', 'web', '界面新闻已认证雷报账号 JSON API'],
  ['63fc7d5e-9d04-49fe-84e4-22d10f595c86', 'https://www.ign.com/entertainment/anime', 'web', '当前 Anime 栏目：本地 CDP 抓取'],
  ['f10b300c-1b83-4733-b17d-5fef4ae02c56', 'https://www.animenewsnetwork.com/', 'web', '官网拦截：本地 CDP 抓取'],
  ['ee46aee0-f403-47fe-9b94-d6e06910b658', 'https://www.polygon.com/feed/', 'rss', '官方 RSS: /feed/'],
  ['c7068f2c-9455-410b-b3ad-5a75020ad003', 'https://licensinginternational.org/news/', 'web', '官方 News HTML 列表'],
  ['29d3f4a7-a4d7-42bf-b25b-383a383cb5f6', 'https://icom.museum/en/news/?pid=2', 'web', '官方 News HTML 列表'],
  ['11344dd9-e7de-4922-bdf2-18a25b4ed1d0', 'https://www.museumsassociation.org/museums-journal/news/', 'web', 'Museums Journal News HTML 列表'],
] as const

const duplicateIds = [
  'e4912b24-eb0f-4e24-8fc8-3fc91ee4ff4c',
  '1a0886dc-1d24-4e03-acb3-bb95eeb71b1f',
  'a324c6c8-eff7-4ff4-abb6-995e3bb9b88d',
]

export async function POST(request: Request) {
  if (request.headers.get('x-repair-token') !== TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { action?: string; id?: string }
  const supabase = createServiceClient()

  if (body.action === 'sync') {
    const results = []
    for (const [id, url, fetchType, method] of updates) {
      const { error } = await supabase.from('info_sources').update({ url, fetch_type: fetchType, method }).eq('id', id)
      results.push({ id, ok: !error, error: error?.message })
    }
    const { error: toolsError } = await supabase.from('info_sources').delete().eq('section_id', 'tools')
    const { error: obsoleteError } = await supabase.from('info_sources').delete().in('name', ['艺恩网', '猫眼专业版'])
    const { error: duplicatesError } = await supabase.from('info_sources').delete().in('id', duplicateIds)
    return NextResponse.json({
      ok: results.every((result) => result.ok) && !toolsError && !obsoleteError && !duplicatesError,
      results,
      deletions: {
        tools: toolsError?.message ?? 'ok',
        obsolete: obsoleteError?.message ?? 'ok',
        duplicateRss: duplicatesError?.message ?? 'ok',
      },
    })
  }

  if (body.action !== 'test' || !body.id) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { data: source, error } = await supabase
    .from('info_sources')
    .select('id, name, url, fetch_type')
    .eq('id', body.id)
    .single()
  if (error || !source) return NextResponse.json({ error: error?.message || 'Source not found' }, { status: 404 })

  const configured = findSourceConfiguration(source.url, source.name)
  if (!configured) return NextResponse.json({ error: 'Configuration not found' }, { status: 400 })

  const counts: number[] = []
  const errors: string[] = []
  if (configured.needsLocalCdp) {
    counts.push(0)
  } else {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (configured.type === 'rss' || configured.isRss) {
        try {
          const feed = await parseFeedUrl(configured.url, 25_000)
          counts.push(feed.items.filter((item) => item.title && item.link).length)
        } catch (testError) {
          counts.push(0)
          errors.push(testError instanceof Error ? testError.message : String(testError))
        }
      } else if (configured.scrapeConfig) {
        const result = await scrapeNewsList(source.name, configured.url, configured.scrapeConfig)
        counts.push(result.items.length)
        if (result.error) errors.push(result.error)
      }
    }
  }

  const expected = configured.type === 'rss' ? 1 : configured.scrapeConfig?.maxItems ?? 1
  const passed = configured.needsLocalCdp || (counts.length === 3 && counts.every((count) => count >= expected) && errors.length === 0)
  const message = configured.needsLocalCdp
    ? '已正确分流到本地 CDP；Vercel 不执行受保护页面抓取。'
    : passed
      ? `生产连续 3 次测试成功：${counts.join('/')}`
      : `生产测试失败：${counts.join('/')} ${errors.join('; ')}`

  await supabase.from('info_sources').update({
    last_test_status: passed ? 'success' : 'failed',
    last_tested_at: new Date().toISOString(),
    last_test_message: message.slice(0, 500),
    ...(passed ? {} : { enabled: false }),
  }).eq('id', source.id)

  return NextResponse.json({ ok: passed, id: source.id, name: source.name, counts, errors, message })
}
