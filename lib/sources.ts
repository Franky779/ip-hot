export type HtmlScrapeConfig = {
  adapter?: 'html'
  itemSelector: string
  titleSelector: string
  linkSelector: string
  linkPrefix?: string
  maxItems?: number
}

export type BilibiliTimelineConfig = {
  adapter: 'bilibili-guochuang-timeline'
  apiUrl: string
  maxItems?: number
}

export type AutoNewsConfig = {
  adapter: 'auto-news-links'
  maxItems?: number
}

export type News17173SearchConfig = {
  adapter: '17173-search'
  apiUrl: string
  keyword: string
  maxItems?: number
}

export type JiemianAccountConfig = {
  adapter: 'jiemian-account'
  apiUrl: string
  accountId: string
  maxItems?: number
}

export type ScrapeConfig =
  | HtmlScrapeConfig
  | BilibiliTimelineConfig
  | AutoNewsConfig
  | News17173SearchConfig
  | JiemianAccountConfig

export type NewsSource = {
  id: string
  name: string
  url: string
  language: 'en' | 'zh' | 'ja'
  priority: 'P0' | 'P1' | 'P2'
  type: 'rss' | 'web' | 'gov'
  /** 是否为RSS源（优先用rss-parser） */
  isRss?: boolean
  /** 网页抓取配置（web/gov类型必填） */
  scrapeConfig?: ScrapeConfig
  /** 是否需要Scrapling兜底 */
  needsScraplingFallback?: boolean
  /** 是否需登录（暂跳过的源） */
  loginRequired?: boolean
  /** 是否只能走本地CDP抓取（Vercel服务器IP被拦） */
  needsLocalCdp?: boolean
  /** 已完成重复抓取验收，可在 enabled=true 时进入服务端定时任务 */
  automationEnabled?: boolean
}

// ============================================================
// RSS 源（A类+B类+D类）— 共30个
// ============================================================
export const RSS_SOURCES: NewsSource[] = [
  // 海外动漫/ACG
  { id: 'ann', name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/', language: 'en', priority: 'P0', type: 'web', needsLocalCdp: true, scrapeConfig: { itemSelector: 'a[href*="/news/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.animenewsnetwork.com', maxItems: 10 } },
  { id: 'crunchyroll', name: 'Crunchyroll News', url: 'https://www.crunchyroll.com/news/latest', language: 'en', priority: 'P0', type: 'web', needsLocalCdp: true, scrapeConfig: { itemSelector: 'a[href*="/news/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.crunchyroll.com', maxItems: 10 } },
  { id: 'cartoonbrew', name: 'Cartoon Brew', url: 'https://www.cartoonbrew.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  { id: 'awn', name: 'Animation World Network', url: 'https://www.awn.com/rss.xml', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  { id: 'animationmag', name: 'Animation Magazine', url: 'https://www.animationmagazine.net/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  // cbr RSS不可达 → 改用本地CDP，见 scripts/fetch-cdp-local.mjs
  { id: 'otakuusa', name: 'Otaku USA Magazine', url: 'https://otakuusamagazine.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  // screenrant RSS不可达 → 改用本地CDP，见 scripts/fetch-cdp-local.mjs
  // 海外影视/媒体
  { id: 'variety', name: 'Variety', url: 'https://variety.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  { id: 'thr', name: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  // 游戏+动漫综合
  { id: 'polygon', name: 'Polygon', url: 'https://www.polygon.com/', language: 'en', priority: 'P0', type: 'web', needsLocalCdp: true, scrapeConfig: { itemSelector: 'a[href]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.polygon.com', maxItems: 10 } },
  // 文化/博物馆/艺术
  { id: 'hyperallergic', name: 'Hyperallergic', url: 'https://hyperallergic.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  // IP授权/潮玩/玩具
  { id: 'toybook', name: 'The Toy Book', url: 'https://toybook.com/feed', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  { id: 'spankystokes', name: 'Spanky Stokes', url: 'https://www.spankystokes.com/feeds/posts/default', language: 'en', priority: 'P0', type: 'rss', isRss: true },
  // 日本动漫/游戏
  { id: 'animeanime', name: 'Anime Anime', url: 'https://animeanime.jp/category/news/', language: 'ja', priority: 'P0', type: 'web', needsLocalCdp: true, scrapeConfig: { itemSelector: 'a[href*="/article/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://animeanime.jp', maxItems: 10 } },
  { id: 'natalie', name: 'Comic Natalie', url: 'https://natalie.mu/comic/feed/news', language: 'ja', priority: 'P0', type: 'rss', isRss: true },
  { id: '4gamer', name: '4Gamer', url: 'https://www.4gamer.net/rss/index.xml', language: 'ja', priority: 'P0', type: 'rss', isRss: true },
  { id: 'famitsu', name: 'Famitsu', url: 'https://www.famitsu.com/category/news/page/1', language: 'ja', priority: 'P0', type: 'web', needsLocalCdp: true, scrapeConfig: { itemSelector: 'a[href*="/article/"], a[href*="/news/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.famitsu.com', maxItems: 10 } },
  // 国内商业媒体
  { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', language: 'zh', priority: 'P1', type: 'rss', isRss: true },
  { id: 'huxiu', name: '虎嗅', url: 'https://www.huxiu.com/rss/0.xml', language: 'zh', priority: 'P1', type: 'rss', isRss: true },
  { id: 'tmtpost', name: '钛媒体', url: 'https://www.tmtpost.com/rss.xml', language: 'zh', priority: 'P1', type: 'rss', isRss: true },
  // D类 RSSHub — 已实测全部不可达（rsshub.app 超时），改为本地CDP直连
  // 微博热搜 → scripts/fetch-cdp-local.mjs (CDP直连，无需登录)
  // 知乎热榜 → scripts/fetch-cdp-local.mjs (CDP直连，无需登录)
  // B站国创、三文娱、1905、澎湃文化 → E类网页源已有配置
]

// ============================================================
// 网页抓取源（E类 — 无RSS，需HTML解析）
// ============================================================
const WEB_SOURCES: NewsSource[] = [
  // --- 动漫/ACG ---
  {
    id: 'sanwenyu-web', name: '三文娱', url: 'https://www.163.com/dy/media/T1460009632064.html',
    language: 'zh', priority: 'P1', type: 'web', automationEnabled: true,
    scrapeConfig: { itemSelector: '.list_box .js-item', titleSelector: 'a.title[href*="/dy/article/"]', linkSelector: 'a.title[href*="/dy/article/"]', linkPrefix: 'https://www.163.com', maxItems: 10 },
  },
  {
    id: 'gamersky-acg', name: '游民星空动漫', url: 'https://www.gamersky.com/news/',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.Mid2L_con li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.gamersky.com', maxItems: 10 },
  },
  {
    id: 'bilibili-guochuang-api', name: '哔哩哔哩(B站)国创区', url: 'https://www.bilibili.com/v/anime/guochuang',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: {
      adapter: 'bilibili-guochuang-timeline',
      apiUrl: 'https://api.bilibili.com/pgc/web/timeline?types=4&before=7&after=0',
      maxItems: 10,
    },
  },
  {
    id: '17173-acg', name: '17173动漫',
    url: 'https://search.17173.com/?keyword=%E5%8A%A8%E6%BC%AB',
    language: 'zh', priority: 'P1', type: 'web', automationEnabled: true,
    scrapeConfig: {
      adapter: '17173-search',
      apiUrl: 'https://search.17173.com/api/search/queryNews',
      keyword: '动漫',
      maxItems: 10,
    },
  },
  {
    id: 'leibao-jiemian', name: '雷报', url: 'https://www.jiemian.com/account/2079.html',
    language: 'zh', priority: 'P1', type: 'web', automationEnabled: true,
    scrapeConfig: {
      adapter: 'jiemian-account',
      apiUrl: 'https://papi.jiemian.com/page/api/officialAccount/accountArticles',
      accountId: '2079',
      maxItems: 10,
    },
  },
  // --- 潮玩/玩具 ---
  {
    id: 'ctoy-industry', name: '中外玩具网-产业', url: 'https://www.ctoy.com.cn/n/c3990/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'ctoy-company', name: '中外玩具网-公司', url: 'https://www.ctoy.com.cn/n/c3993/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'ctoy-channel', name: '中外玩具网-渠道', url: 'https://www.ctoy.com.cn/n/c3991/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'ctoy-license', name: '中外玩具网-授权', url: 'https://www.ctoy.com.cn/n/c4009/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'ctoy-consumer', name: '中外玩具网-消费', url: 'https://www.ctoy.com.cn/n/c3992/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'ctoy-toy', name: '中外玩具网-潮玩', url: 'https://www.ctoy.com.cn/n/c4053/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 },
  },
  {
    id: 'wjyt', name: '玩具产业网', url: 'https://www.wjyt-china.org/',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="detail?id="]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.wjyt-china.org', maxItems: 10 },
  },
  {
    id: 'cle', name: 'CLE中国授权展', url: 'http://www.licensingexpochina.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.licensingexpochina.com', maxItems: 10 },
  },
  // --- 海外IP授权/潮玩 ---
  {
    id: 'artnews', name: 'ArtNews', url: 'https://www.artnews.com/feed',
    language: 'en', priority: 'P0', type: 'rss', isRss: true,
  },
  {
    id: 'vinylpulse', name: 'Vinyl Pulse', url: 'https://www.vinylpulse.com/feed',
    language: 'en', priority: 'P0', type: 'rss', isRss: true,
  },
  {
    id: 'total-licensing', name: 'Total Licensing', url: 'https://www.totallicensing.com/feed',
    language: 'en', priority: 'P0', type: 'rss', isRss: true,
  },
  {
    id: 'licenseglobal', name: 'License Global', url: 'https://www.licenseglobal.com/latest-news',
    language: 'en', priority: 'P0', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: '.VerticalCard', titleSelector: '.VerticalCard-Title_displayOption_default', linkSelector: '.VerticalCard-Title_displayOption_default', linkPrefix: 'https://www.licenseglobal.com', maxItems: 10 },
  },
  {
    id: 'licensingint', name: 'Licensing International', url: 'https://www.licensing.org.cn/news/inside-licensing',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'h2.entry-title a', titleSelector: '', linkSelector: '', maxItems: 10 },
  },

  // --- 文创/文博 ---
  {
    id: 'ccdy', name: '中国文化报', url: 'http://www.ccdy.cn',
    language: 'zh', priority: 'P1', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/details/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ccdy.cn', maxItems: 10 },
  },
  {
    id: 'ctnews', name: '中国旅游报', url: 'http://www.ctnews.com.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li, article', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.ctnews.com.cn', maxItems: 10 },
  },
  {
    id: 'cflac', name: '中国艺术报', url: 'http://www.cflac.org.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'http://www.cflac.org.cn', maxItems: 10 },
  },
  {
    id: 'ncha', name: '国家文物局', url: 'http://www.ncha.gov.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'http://www.ncha.gov.cn', maxItems: 10 },
  },
  {
    id: 'ihchina', name: '中国非物质文化遗产网', url: 'http://www.ihchina.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.list li, .news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.ihchina.cn', maxItems: 10 },
  },

  // --- 影视/游戏 ---
  {
    id: '1905-web', name: '1905电影网', url: 'http://www.1905.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, .movie-list .item, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.1905.com', maxItems: 10 },
  },
  {
    id: 'endata', name: '艺恩网', url: 'http://www.endata.com.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.endata.com.cn', maxItems: 10 },
  },
  // 灯塔 — DNS不可达，已移除
  // 猫眼 — 数据仪表板非新闻源，已移除
  {
    id: 'gamersky', name: '游民星空', url: 'http://www.gamersky.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.imgLB li, .content .txt, ul li', titleSelector: '.tit a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.gamersky.com', maxItems: 10 },
  },
  {
    id: 'youxituoluo', name: '游戏陀螺', url: 'http://www.youxituoluo.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h2 a, h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.youxituoluo.com', maxItems: 10 },
  },
  {
    id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, .news-item, ul li', titleSelector: 'h2 a, h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.ithome.com', maxItems: 10 },
  },
  {
    id: 'mydrivers', name: '快科技', url: 'https://www.mydrivers.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, .item, ul li', titleSelector: 'h2 a, h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.mydrivers.com', maxItems: 10 },
  },

  // --- 财经/商业 ---
  {
    id: 'jiemian', name: '界面新闻', url: 'https://www.jiemian.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.jiemian.com', maxItems: 10 },
  },
  {
    id: 'yicai', name: '第一财经', url: 'https://www.yicai.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.yicai.com', maxItems: 10 },
  },
  {
    id: '21jingji', name: '21世纪经济报道', url: 'http://www.21jingji.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.21jingji.com', maxItems: 10 },
  },
  {
    id: 'bjnews', name: '新京报', url: 'https://www.bjnews.com.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.bjnews.com.cn', maxItems: 10 },
  },
  {
    id: '10jqka', name: '同花顺财经', url: 'https://news.10jqka.com.cn',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://news.10jqka.com.cn', maxItems: 10 },
  },
  {
    id: 'sina-finance', name: '新浪财经', url: 'https://finance.sina.com.cn',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-item, .news-list li, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://finance.sina.com.cn', maxItems: 10 },
  },
  {
    id: 'eastmoney', name: '东方财富网', url: 'https://finance.eastmoney.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://finance.eastmoney.com', maxItems: 10 },
  },
  {
    id: 'redsh', name: '红商网', url: 'http://www.redsh.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.redsh.com', maxItems: 10 },
  },
  {
    id: 'mbachina', name: 'MBA中国网', url: 'https://www.mbachina.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.mbachina.com', maxItems: 10 },
  },
  {
    id: 'sohu', name: '搜狐网', url: 'https://news.sohu.com/',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: 'a[href*="/a/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://news.sohu.com', maxItems: 10 },
  },

  // --- 央媒/综合 ---
  {
    id: 'people', name: '人民网', url: 'http://www.people.com.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li, article', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.people.com.cn', maxItems: 10 },
  },
  {
    id: 'xinhuanet', name: '新华网', url: 'http://www.xinhuanet.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li, article', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'http://www.xinhuanet.com', maxItems: 10 },
  },
  {
    id: 'gmw', name: '光明网', url: 'https://www.gmw.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li, article', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.gmw.cn', maxItems: 10 },
  },
  {
    id: 'cnr', name: '央广网', url: 'https://www.cnr.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.cnr.cn', maxItems: 10 },
  },
  {
    id: 'chinanews', name: '中国新闻网', url: 'https://www.chinanews.com.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li, article', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.chinanews.com.cn', maxItems: 10 },
  },
  {
    id: 'youth', name: '中国青年网', url: 'https://www.youth.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.youth.cn', maxItems: 10 },
  },
  {
    id: 'stdaily', name: '中国科技网', url: 'https://www.stdaily.com',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.stdaily.com', maxItems: 10 },
  },
  {
    id: 'thepaper', name: '澎湃新闻', url: 'https://www.thepaper.cn',
    language: 'zh', priority: 'P1', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.thepaper.cn', maxItems: 10 },
  },

  // --- 地方媒体 ---
  {
    id: 'qianlong', name: '千龙网', url: 'http://www.qianlong.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.qianlong.com', maxItems: 10 },
  },
  {
    id: 'ynet', name: '北青网', url: 'https://www.ynet.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.ynet.com', maxItems: 10 },
  },
  {
    id: 'jfdaily', name: '上观新闻', url: 'https://www.jfdaily.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.jfdaily.com', maxItems: 10 },
  },
  {
    id: 'shxwcb', name: '新闻晨报', url: 'https://www.shxwcb.com',
    language: 'zh', priority: 'P2', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="/detail/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.shxwcb.com', maxItems: 10 },
  },
  {
    id: 'zjol', name: '浙江日报/潮新闻', url: 'http://www.zjol.com.cn',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.zjol.com.cn', maxItems: 10 },
  },
  {
    id: 'hubeidaily', name: '湖北日报', url: 'http://www.hubeidaily.net',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.hubeidaily.net', maxItems: 10 },
  },
  {
    id: 'dzwww', name: '大众日报', url: 'https://www.dzwww.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.dzwww.com', maxItems: 10 },
  },
  {
    id: 'cdsb', name: '红星新闻', url: 'https://www.cdsb.com',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, article, ul li', titleSelector: 'h3 a, h2 a, a', linkSelector: 'a', linkPrefix: 'https://www.cdsb.com', maxItems: 10 },
  },
  {
    id: 'ctdsb', name: '极目新闻', url: 'http://www.ctdsb.net',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.ctdsb.net', maxItems: 10 },
  },
  {
    id: 'ycwb', name: '金羊网', url: 'https://www.ycwb.com',
    language: 'zh', priority: 'P2', type: 'web', needsLocalCdp: true,
    scrapeConfig: { itemSelector: 'a[href*="content_"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ycwb.com', maxItems: 10 },
  },
  {
    id: 'xiancity', name: '西安网', url: 'https://www.xiancity.cn',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: '.news-list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'https://www.xiancity.cn', maxItems: 10 },
  },

  // --- 社交/UGC ---
  // 豆瓣 → 已移除（需登录+反爬严格，不适合自动化）

  // --- CDP本地抓取源（JS渲染页面，需本地CDP，无需登录） ---
  {
    id: 'weibo-hot-web', name: '微博热搜', url: 'https://s.weibo.com/top/summary',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: 'td.td-02 a', titleSelector: 'a', linkSelector: 'a', maxItems: 20 },
  },
  {
    id: 'zhihu-hot-web', name: '知乎热榜', url: 'https://www.zhihu.com/hot',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: 'a[href*="/question/"]', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.zhihu.com', maxItems: 15 },
  },
  {
    id: 'thepaper-cdp', name: '澎湃新闻', url: 'https://www.thepaper.cn/list_25462',
    language: 'zh', priority: 'P2', type: 'web',
    scrapeConfig: { itemSelector: 'h2 a, h3 a', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.thepaper.cn', maxItems: 10 },
  },
  {
    id: 'screenrant-cdp', name: 'ScreenRant', url: 'https://screenrant.com/category/anime/',
    language: 'en', priority: 'P0', type: 'web',
    scrapeConfig: { itemSelector: 'h3 a[href]', titleSelector: 'a', linkSelector: 'a', maxItems: 10 },
  },
  {
    id: 'cbr-cdp', name: 'CBR', url: 'https://www.cbr.com/category/anime/',
    language: 'en', priority: 'P0', type: 'web',
    scrapeConfig: { itemSelector: 'h3 a[href]', titleSelector: 'a', linkSelector: 'a', maxItems: 10 },
  },

  // --- 需登录（暂配置但标记跳过） ---
  {
    id: 'zhihu-leibao', name: '知乎雷报', url: 'https://www.zhihu.com/people/wanshangkansha/posts',
    language: 'zh', priority: 'P1', type: 'web', loginRequired: true,
    scrapeConfig: { itemSelector: '.ContentItem', titleSelector: '.ContentItem-title a', linkSelector: 'a', linkPrefix: 'https://www.zhihu.com', maxItems: 10 },
  },
]

// ============================================================
// 政府网站（F类）— 40个，每周跑一次
// ============================================================
const GOV_SOURCES: NewsSource[] = [
  // 中央部委
  { id: 'mct', name: '文化和旅游部', url: 'https://www.mct.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.mct.gov.cn', maxItems: 5 } },
  { id: 'nrta', name: '国家广播电视总局', url: 'https://www.nrta.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.nrta.gov.cn', maxItems: 5 } },
  { id: 'acgg', name: '中国动漫集团', url: 'http://www.acgg.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, ul li', titleSelector: 'h3 a, a', linkSelector: 'a', linkPrefix: 'http://www.acgg.cn', maxItems: 5 } },
  { id: 'gov-cn', name: '国务院', url: 'https://www.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.gov.cn', maxItems: 5 } },
  { id: 'ndrc', name: '国家发改委', url: 'https://www.ndrc.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.ndrc.gov.cn', maxItems: 5 } },
  { id: 'miit', name: '工业和信息化部', url: 'https://www.miit.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.miit.gov.cn', maxItems: 5 } },
  { id: 'cnipa', name: '国家知识产权局', url: 'https://www.cnipa.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.cnipa.gov.cn', maxItems: 5 } },
  { id: 'mof', name: '财政部', url: 'https://www.mof.gov.cn/', language: 'zh', priority: 'P1', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.mof.gov.cn', maxItems: 5 } },
  // 省级文旅厅
  { id: 'zj-wlt', name: '浙江省文旅厅', url: 'https://ct.zj.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://ct.zj.gov.cn', maxItems: 5 } },
  { id: 'dg-gov', name: '东莞市人民政府', url: 'https://www.dg.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.dg.gov.cn', maxItems: 5 } },
  { id: 'hz-xh', name: '杭州西湖区政府', url: 'https://www.hzxh.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://www.hzxh.gov.cn', maxItems: 5 } },
  { id: 'xj-wlt', name: '新疆文旅厅', url: 'https://wlt.xinjiang.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.xinjiang.gov.cn', maxItems: 5 } },
  { id: 'bj-wlj', name: '北京市文旅局', url: 'https://whlyj.beijing.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://whlyj.beijing.gov.cn', maxItems: 5 } },
  { id: 'tj-wl', name: '天津市文旅局', url: 'https://whly.tj.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://whly.tj.gov.cn', maxItems: 5 } },
  { id: 'sh-wlj', name: '上海市文旅局', url: 'https://whlyj.sh.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://whlyj.sh.gov.cn', maxItems: 5 } },
  { id: 'cq-wl', name: '重庆市文旅委', url: 'https://wlt.cq.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.cq.gov.cn', maxItems: 5 } },
  { id: 'heb-wlt', name: '河北省文旅厅', url: 'https://wlt.hebei.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.hebei.gov.cn', maxItems: 5 } },
  { id: 'sx-wlt', name: '山西省文旅厅', url: 'https://wlt.shanxi.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.shanxi.gov.cn', maxItems: 5 } },
  { id: 'ln-wlt', name: '辽宁省文旅厅', url: 'https://wlt.ln.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.ln.gov.cn', maxItems: 5 } },
  { id: 'jl-wlt', name: '吉林省文旅厅', url: 'https://wlt.jl.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.jl.gov.cn', maxItems: 5 } },
  { id: 'hlj-wlt', name: '黑龙江省文旅厅', url: 'https://wlt.hlj.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.hlj.gov.cn', maxItems: 5 } },
  { id: 'js-wlt', name: '江苏省文旅厅', url: 'https://wlt.jiangsu.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.jiangsu.gov.cn', maxItems: 5 } },
  { id: 'ah-wlt', name: '安徽省文旅厅', url: 'https://wlt.ah.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.ah.gov.cn', maxItems: 5 } },
  { id: 'fj-wlt', name: '福建省文旅厅', url: 'https://wlt.fujian.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.fujian.gov.cn', maxItems: 5 } },
  { id: 'jx-wlt', name: '江西省文旅厅', url: 'https://wlt.jiangxi.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.jiangxi.gov.cn', maxItems: 5 } },
  { id: 'sd-wlt', name: '山东省文旅厅', url: 'https://wlt.shandong.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.shandong.gov.cn', maxItems: 5 } },
  { id: 'henan-wlt', name: '河南省文旅厅', url: 'https://wlt.henan.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.henan.gov.cn', maxItems: 5 } },
  { id: 'hubei-wlt', name: '湖北省文旅厅', url: 'https://wlt.hubei.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.hubei.gov.cn', maxItems: 5 } },
  { id: 'hunan-wlt', name: '湖南省文旅厅', url: 'https://whhly.hunan.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://whhly.hunan.gov.cn', maxItems: 5 } },
  { id: 'gd-wlt', name: '广东省文旅厅', url: 'https://wlt.gd.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.gd.gov.cn', maxItems: 5 } },
  { id: 'gx-wlt', name: '广西文旅厅', url: 'https://wlt.gxzf.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.gxzf.gov.cn', maxItems: 5 } },
  { id: 'hainan-lwt', name: '海南省旅文厅', url: 'https://lwt.hainan.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://lwt.hainan.gov.cn', maxItems: 5 } },
  { id: 'sc-wlt', name: '四川省文旅厅', url: 'https://wlt.sc.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.sc.gov.cn', maxItems: 5 } },
  { id: 'gz-wlt', name: '贵州省文旅厅', url: 'https://wlt.guizhou.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.guizhou.gov.cn', maxItems: 5 } },
  { id: 'yn-wlt', name: '云南省文旅厅', url: 'https://wlt.yn.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.yn.gov.cn', maxItems: 5 } },
  { id: 'xz-wlt', name: '西藏文旅厅', url: 'https://wlt.xizang.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.xizang.gov.cn', maxItems: 5 } },
  { id: 'sn-wlt', name: '陕西省文旅厅', url: 'https://wlt.shaanxi.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.shaanxi.gov.cn', maxItems: 5 } },
  { id: 'gs-wlt', name: '甘肃省文旅厅', url: 'https://wlt.gansu.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.gansu.gov.cn', maxItems: 5 } },
  { id: 'qh-wlt', name: '青海省文旅厅', url: 'https://wlt.qinghai.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.qinghai.gov.cn', maxItems: 5 } },
  { id: 'nx-wlt', name: '宁夏文旅厅', url: 'https://wlt.nx.gov.cn/', language: 'zh', priority: 'P2', type: 'gov', scrapeConfig: { itemSelector: '.list li, table tr, ul li', titleSelector: 'a', linkSelector: 'a', linkPrefix: 'https://wlt.nx.gov.cn', maxItems: 5 } },
]

// ============================================================
// 合并导出
// ============================================================
export const ALL_SOURCES = [...RSS_SOURCES, ...WEB_SOURCES, ...GOV_SOURCES]

function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase()
  }
}

function normalizeSourceName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/官网|官方|资讯|新闻|频道|文化频道/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function findSourceConfiguration(url: string, name = ''): NewsSource | undefined {
  const normalizedUrl = normalizeSourceUrl(url)
  const exact = ALL_SOURCES.find((source) => normalizeSourceUrl(source.url) === normalizedUrl)
  if (exact) return exact

  const normalizedName = normalizeSourceName(name)
  if (!normalizedName) return undefined

  return ALL_SOURCES.find((source) => {
    const candidateName = normalizeSourceName(source.name)
    return candidateName === normalizedName
      || (candidateName.length >= 4 && normalizedName.includes(candidateName))
      || (normalizedName.length >= 4 && candidateName.includes(normalizedName))
  })
}

// 非政府源（每天抓取）
export const NON_GOV_SOURCES = [...RSS_SOURCES, ...WEB_SOURCES].filter((s) => !s.loginRequired && !s.needsLocalCdp)

// 政府源（每周抓取）
export const GOV_ONLY_SOURCES = GOV_SOURCES

// 新增信源：初次抓取的文章强制归类为"待分类"
export const NEW_SOURCE_IDS = new Set([
  'licensingint',
  'weibo-hot-web', 'zhihu-hot-web', 'thepaper-cdp', 'screenrant-cdp', 'cbr-cdp',
])

export const NEW_SOURCE_NAMES = new Set(
  ALL_SOURCES.filter((s) => NEW_SOURCE_IDS.has(s.id)).map((s) => s.name)
)

// ============================================================
// 分批轮询：24小时覆盖全部非政府源
// ============================================================
const BATCH_COUNT = 24
const BATCH_SIZE = Math.ceil(NON_GOV_SOURCES.length / BATCH_COUNT)

/**
 * 获取指定小时应该处理的源批次
 */
export function getBatchForHour(hour: number): { sources: NewsSource[]; batchIndex: number; totalBatches: number } {
  const idx = hour % BATCH_COUNT
  const start = idx * BATCH_SIZE
  const end = Math.min(start + BATCH_SIZE, NON_GOV_SOURCES.length)
  return {
    sources: NON_GOV_SOURCES.slice(start, end),
    batchIndex: idx,
    totalBatches: BATCH_COUNT,
  }
}

/**
 * 兼容性导出：保留旧名称
 */
export const RSS_BATCH_EVEN = RSS_SOURCES.filter((s) => s.priority === 'P0')
export const RSS_BATCH_ODD = RSS_SOURCES.filter((s) => s.priority === 'P1' || s.priority === 'P2')
export const RSS_SOURCES_LEGACY = RSS_SOURCES
