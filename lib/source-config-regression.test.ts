import assert from 'node:assert/strict'
import test from 'node:test'

import { scrapeNewsList } from './scraper.ts'
import { checkLink } from './link-checker.ts'
import { ALL_SOURCES, findSourceConfiguration } from './sources.ts'

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

test('uses the official China ICH news list and extracts ten articles', async (t) => {
  const html = Array.from({ length: 10 }, (_, index) => `
    <div class="h16">
      <a href="/news_details/${31620 + index}.html" title="非遗新闻测试标题${index}">非遗新闻测试标题${index}</a>
    </div>
  `).join('')
  t.mock.method(globalThis, 'fetch', async () => htmlResponse(html))

  const source = findSourceConfiguration('http://www.ihchina.cn', '中国非物质文化遗产网')
  assert.equal(source?.url, 'https://www.ihchina.cn/news')
  assert.ok(source?.scrapeConfig)

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.equal(new Set(result.items.map((item) => item.url)).size, 10)
})

test('uses the Paper culture channel and ignores the former politics URL', async (t) => {
  const html = Array.from({ length: 10 }, (_, index) => `
    <a href="/newsDetail_forward_${33630000 + index}">文化课新闻测试标题${index}</a>
  `).join('')
  t.mock.method(globalThis, 'fetch', async () => htmlResponse(html))

  const source = findSourceConfiguration(
    'https://www.thepaper.cn/list_25450',
    '澎湃新闻 文化频道',
  )
  assert.equal(source?.id, 'thepaper-cdp')
  assert.equal(source?.url, 'https://www.thepaper.cn/list_25450')
  assert.ok(source?.scrapeConfig)

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.equal(new Set(result.items.map((item) => item.url)).size, 10)
})

test('extracts Zhihu hot list items from the public API', async (t) => {
  const data = Array.from({ length: 12 }, (_, index) => ({
    target: { type: 'question', title: `知乎热榜测试标题${index}`, url: `https://api.zhihu.com/questions/${2064000000000000000 + index}`, created: 1784908486 + index },
  }))
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const source = findSourceConfiguration('https://www.zhihu.com/hot', '知乎热榜')
  assert.equal(source?.id, 'zhihu-hot-web')
  assert.equal(source?.scrapeConfig?.adapter, 'zhihu-hot-api')
  assert.ok(source?.scrapeConfig)
  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.startsWith('https://www.zhihu.com/question/')))
})

test('uses Google News RSS fallback for License Global', () => {
  const source = findSourceConfiguration('https://www.licenseglobal.com/latest-news', 'License Global')
  assert.equal(source?.id, 'licenseglobal')
  assert.equal(source?.type, 'rss')
  assert.equal(source?.isRss, true)
  assert.match(source?.url ?? '', /^https:\/\/news\.google\.com\/rss\/search\?q=site%3Alicenseglobal\.com/)
})

test('uses the current Chongqing culture and tourism committee site', async (t) => {
  const html = Array.from({ length: 10 }, (_, index) => `
    <a href="/zwxx_221/bmdt/gzdt/202607/t20260724_${15851727 + index}.html" title="重庆文旅测试标题${index}">重庆文旅测试标题${index}</a>
  `).join('')
  t.mock.method(globalThis, 'fetch', async () => htmlResponse(html))

  const source = findSourceConfiguration('https://wlt.cq.gov.cn/', '重庆市文化和旅游发展委员会')
  assert.equal(source?.id, 'cq-wl')
  assert.equal(source?.url, 'https://whlyw.cq.gov.cn/')
  assert.ok(source?.scrapeConfig)

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.startsWith('https://whlyw.cq.gov.cn/zwxx_221/bmdt/')))
})

test('extracts Zhejiang Daily articles from the current official homepage links', async (t) => {
  const html = Array.from({ length: 10 }, (_, index) => `
    <a href="https://zjnews.zjol.com.cn/zjnews/202607/t20260724_${31804790 + index}.shtml">浙江日报测试标题${index}</a>
  `).join('')
  t.mock.method(globalThis, 'fetch', async () => htmlResponse(html))

  const source = findSourceConfiguration('https://www.zjol.com.cn/', '浙江日报/潮新闻')
  assert.equal(source?.id, 'zjol')
  assert.equal(source?.needsLocalCdp, undefined)
  assert.equal(source?.url, 'https://zjnews.zjol.com.cn/')
  assert.ok(source?.scrapeConfig)

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.includes('zjnews.zjol.com.cn')))
})

test('retries the toy industry site after solving its acw cookie challenge', async (t) => {
  const challenge = '<html><script>document.cookie = \'acw_sc__v2=test-cookie;path=/\'; document.location.reload();</script></html>'
  const articleHtml = Array.from({ length: 10 }, (_, index) => `
    <a href="/detail?id=${40000 + index}">玩具产业网测试资讯标题${index}</a>
  `).join('')
  const requests: Request[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requests.push(new Request(input, init))
    return requests.length === 1 ? htmlResponse(challenge) : htmlResponse(articleHtml)
  })

  const source = findSourceConfiguration('https://www.wjyt-china.org/', '玩具产业网')
  assert.equal(source?.id, 'wjyt')
  assert.equal(source?.needsLocalCdp, undefined)
  assert.ok(source?.scrapeConfig)

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.equal(requests[1]?.headers.get('cookie'), 'acw_sc__v2=test-cookie')
})

test('moves the verified local CDP sources to cloud execution', () => {
  const sourceIds = [
    'ign-anime', 'animeanime', 'famitsu',
    'ctoy-industry', 'ctoy-company', 'ctoy-channel',
    'ctoy-license', 'ctoy-consumer', 'ctoy-toy',
    'ynet', 'dg-gov', 'hz-xh', 'tj-wl', 'cdsb', 'ycwb',
    'ccdy', 'shxwcb', 'crunchyroll', 'licenseglobal',
  ]

  for (const id of sourceIds) {
    const source = ALL_SOURCES.find((candidate) => candidate.id === id)
    assert.ok(source, `missing source ${id}`)
    assert.equal(source.needsLocalCdp, undefined, `${id} must run in cloud mode`)
  }
})

test('extracts China Culture Daily articles from the digital paper API', async (t) => {
  const digitaldata = JSON.stringify({
    data: [{
      polygons: Array.from({ length: 12 }, (_, index) => ({
        id: `article-${index}`,
        title: `中国文化报测试资讯标题${index}`,
      })),
    }],
  })
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    code: 200,
    data: { list: [{ digitaldata }] },
  }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const source = findSourceConfiguration('http://www.ccdy.cn', '中国文化报')
  assert.ok(source?.scrapeConfig)
  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)

  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.startsWith('https://www.ccdy.cn/#/details/')))
})

test('extracts Morning Post articles from the encrypted public API response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    code: 200,
    data: [{
      Data: Array.from({ length: 10 }, (_, index) => ({
        ContentId: `content-${index}`,
        ContentTitle: `<strong>新闻晨报测试资讯标题${index}</strong>`,
        ContentPublishTimestamp: 1784858317 + index,
      })),
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }))

  const source = findSourceConfiguration('https://www.shxwcb.com', '新闻晨报')
  assert.ok(source?.scrapeConfig)
  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)

  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.startsWith('https://www.shxwcb.com/#/detail/')))
})

test('extracts official article links from the markdown proxy fallback', async (t) => {
  const markdown = Array.from({ length: 12 }, (_, index) => (
    `### [Crunchyroll proxy article title ${index}](http://www.crunchyroll.com/news/latest/2026/7/24/article-${index})`
  )).join('\n')
  t.mock.method(globalThis, 'fetch', async () => new Response(markdown, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  }))

  const source = ALL_SOURCES.find((candidate) => candidate.id === 'crunchyroll')
  assert.ok(source?.scrapeConfig)
  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)

  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 10)
  assert.ok(result.items.every((item) => item.url.startsWith('https://www.crunchyroll.com/news/')))
})

test('checks Cloudflare-blocked article links through the markdown proxy', async (t) => {
  const requests: Request[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requests.push(new Request(input, init))
    return new Response('article', { status: 200 })
  })

  const result = await checkLink('https://www.licenseglobal.com/toys-games/test-article')
  assert.equal(result.ok, true)
  assert.equal(requests[0]?.url, 'https://r.jina.ai/http://www.licenseglobal.com/toys-games/test-article')
})

test('checks Dongguan article links through the markdown proxy', async (t) => {
  const requests: Request[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    requests.push(new Request(input, init))
    return new Response('article', { status: 200 })
  })

  const result = await checkLink('https://wglt.dg.gov.cn/zxfw/gzdt/content/post_4564409.html')
  assert.equal(result.ok, true)
  assert.equal(requests[0]?.url, 'https://r.jina.ai/http://wglt.dg.gov.cn/zxfw/gzdt/content/post_4564409.html')
})

test('checks protected Ctoy article links through the markdown proxy without the short direct timeout', async (t) => {
  const requests: Request[] = []
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const request = new Request(input, init)
    requests.push(request)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 20)
      request.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    })
    return new Response('article', { status: 200 })
  })

  const result = await checkLink('https://www.ctoy.com.cn/n/d46384.html', 1)
  assert.equal(result.ok, true)
  assert.equal(requests[0]?.url, 'https://r.jina.ai/http://www.ctoy.com.cn/n/d46384.html')
})

test('extracts all Ctoy cloud columns from the markdown proxy', async (t) => {
  const markdown = Array.from({ length: 12 }, (_, index) => (
    `[![  Image ${index + 1}](https://img.ctoy.com.cn/article-${index}.jpg)](http://www.ctoy.com.cn/n/d${46000 + index}.html)\n`
    + `[Ctoy proxy article title ${index}](http://www.ctoy.com.cn/n/d${46000 + index}.html)`
  )).join('\n')
  t.mock.method(globalThis, 'fetch', async () => new Response(markdown, { status: 200 }))

  const sourceIds = [
    'ctoy-industry', 'ctoy-company', 'ctoy-channel',
    'ctoy-license', 'ctoy-consumer', 'ctoy-toy',
  ]
  for (const id of sourceIds) {
    const source = ALL_SOURCES.find((candidate) => candidate.id === id)
    assert.ok(source?.scrapeConfig)
    const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
    assert.equal(result.error, undefined, id)
    assert.equal(result.items.length, 10, id)
    assert.ok(result.items.every((item) => item.title.startsWith('Ctoy proxy article title')), id)
    assert.ok(result.items.every((item) => /^https:\/\/www\.ctoy\.com\.cn\/n\/d\d+\.html$/.test(item.url)), id)
  }
})

test('extracts image-wrapped links and markdown link titles', async (t) => {
  const markdown = [
    '[![Image 1: 东莞测试标题](https://wglt.dg.gov.cn/images/1.jpg) 东莞测试标题](http://wglt.dg.gov.cn/zxfw/gzdt/content/post_4564409.html "东莞测试标题")',
    '[License Global 测试标题](https://www.licenseglobal.com/toys-games/license-global-test "License Global 测试标题")',
  ].join('\n')
  t.mock.method(globalThis, 'fetch', async () => new Response(markdown, { status: 200 }))

  const dg = ALL_SOURCES.find((candidate) => candidate.id === 'dg-gov')
  assert.ok(dg?.scrapeConfig)
  const dgResult = await scrapeNewsList(dg.name, dg.url, dg.scrapeConfig)
  assert.equal(dgResult.items.length, 1)
  assert.equal(dgResult.items[0]?.title, '东莞测试标题')

})

test('extracts Red Star News static article links from proxied homepage markdown', async (t) => {
  const sitemap = '<urlset><url><loc>https://static.cdsb.com/micropub/Articles/202607/test-article.html</loc></url></urlset>'
  t.mock.method(globalThis, 'fetch', async (input) => String(input).includes('cdsbmap.xml')
    ? new Response(sitemap, { status: 200 })
    : new Response('<html><title>成都测试标题</title></html>', { status: 200 }))

  const source = ALL_SOURCES.find((candidate) => candidate.id === 'cdsb')
  assert.ok(source?.scrapeConfig)
  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.title, '成都测试标题')
  assert.equal(result.items[0]?.url, 'https://static.cdsb.com/micropub/Articles/202607/test-article.html')
})

test('retries an intermittent Jiemian account API failure and keeps only the configured account', async (t) => {
  const source = ALL_SOURCES.find((candidate) => candidate.id === 'leibao-jiemian')
  assert.ok(source?.scrapeConfig)

  const list = Array.from({ length: 10 }, (_, index) => ({
    object_type: 'article',
    title: `雷报测试标题${index + 1}`,
    url: `https://www.jiemian.com/article/${14713560 + index}.html`,
    publish_time: String(1783392812 + index),
    source: { official_account: { id: index === 9 ? 'other-account' : '2079', name: '雷报' } },
  }))
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1
    if (requests === 1) throw new TypeError('fetch failed')
    return new Response(`ipHotCallback(${JSON.stringify({ code: 0, data: { list } })})`, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  })

  const result = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
  assert.equal(requests, 2)
  assert.equal(result.error, undefined)
  assert.equal(result.items.length, 9)
  assert.ok(result.items.every((item) => item.url.includes('jiemian.com/article/')))
})
