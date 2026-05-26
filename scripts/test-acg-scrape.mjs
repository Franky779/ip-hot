// 本地测试：抓取三文娱/游民星空/17173
import { scrapeNewsList } from '../lib/scraper.ts'

const sources = [
  { name: '三文娱', url: 'https://www.163.com/dy/media/T1460009632064.html', config: { itemSelector: 'a[href*="/article/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.163.com', maxItems: 10 } },
  { name: '游民星空动漫', url: 'https://www.gamersky.com/news/', config: { itemSelector: '.Mid2L_con li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.gamersky.com', maxItems: 10 } },
  { name: '17173动漫', url: 'http://acg.17173.com', config: { itemSelector: 'a[href*="news.17173.com/content/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://news.17173.com', maxItems: 10 } },
]

for (const s of sources) {
  console.log(`\n=== ${s.name} ===`)
  const result = await scrapeNewsList(s.name, s.url, s.config)
  if (result.error) {
    console.log('ERROR:', result.error)
  } else {
    console.log(`Fetched ${result.items.length} items (raw: ${result.rawCount})`)
    for (const item of result.items.slice(0, 5)) {
      console.log(`  - ${item.title.slice(0, 60)} | ${item.url.slice(0, 60)}`)
    }
  }
}
