import { scrapeNewsList } from '../lib/scraper.ts'

const sources = [
  { name: 'License Global', url: 'https://www.licenseglobal.com', config: { itemSelector: '.TopFeatured-LatestNewsItemInfo', titleSelector: 'h3', linkSelector: 'a', maxItems: 5 } },
  { name: 'KidScreen', url: 'https://kidscreen.com', config: { itemSelector: 'li.superPost', titleSelector: 'h2', linkSelector: 'a.superLink', maxItems: 5 } },
  { name: 'Licensing International', url: 'https://licensinginternational.org/news', config: { itemSelector: '.news-post-content', titleSelector: 'h3', linkSelector: 'a', maxItems: 5 } },
]

for (const s of sources) {
  console.log(`\n=== ${s.name} ===`)
  const result = await scrapeNewsList(s.name, s.url, s.config)
  if (result.error) {
    console.log('ERROR:', result.error)
  } else {
    console.log(`Fetched ${result.items.length} items (raw: ${result.rawCount})`)
    for (const item of result.items.slice(0, 3)) {
      console.log(`  - ${item.title.slice(0, 70)} | ${item.url.slice(0, 80)}`)
    }
  }
}
