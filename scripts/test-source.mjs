import { ALL_SOURCES } from '../lib/sources.ts'
import { scrapeNewsList } from '../lib/scraper.ts'
import { parseFeedUrl } from '../lib/rss.ts'

const sourceId = process.argv[2]
const attempts = Number.parseInt(process.argv[3] || '3', 10)

if (!sourceId) {
  console.error('用法: npm run test:source -- <source_id> [attempts]')
  process.exit(1)
}

const source = ALL_SOURCES.find((candidate) => candidate.id === sourceId)
if (!source) {
  console.error(`未找到信息源: ${sourceId}`)
  process.exit(1)
}
const expectedCount = source.type === 'rss' ? 1 : source.scrapeConfig?.maxItems ?? 10
const runs = []

for (let attempt = 1; attempt <= attempts; attempt++) {
  const result = source.type === 'rss'
    ? await parseFeedUrl(source.url).then((feed) => ({
        items: feed.items
          .filter((item) => item.title && item.link)
          .map((item) => ({ title: item.title, url: item.link })),
        rawCount: feed.items.length,
        error: undefined,
      }))
    : source.scrapeConfig
      ? await scrapeNewsList(source.name, source.url, source.scrapeConfig)
      : { items: [], rawCount: 0, error: '缺少 scrapeConfig' }
  const uniqueUrls = new Set(result.items.map((item) => item.url))
  const passed =
    !result.error &&
    result.items.length >= expectedCount &&
    uniqueUrls.size === result.items.length &&
    result.items.every((item) => item.title && item.url)

  runs.push({
    attempt,
    passed,
    itemCount: result.items.length,
    rawCount: result.rawCount,
    error: result.error ?? null,
    firstItem: result.items[0] ?? null,
  })

  if (attempt < attempts) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
}

const passed = runs.every((run) => run.passed)
console.log(JSON.stringify({
  sourceId,
  sourceName: source.name,
  passed,
  expectedCount,
  attempts,
  runs,
}, null, 2))

if (!passed) process.exit(1)
