# 信息源抓取调试 SOP

本流程用于把 `ip-hot` 中“无法测试 / 自动抓取已停用”的单个信息源，逐一变成可测试、可启用、可定时运行的稳定信息源。

## 一、完成标准

一个信息源只有同时满足以下条件，才算“跑通”：

1. 实际访问成功，已记录最终 URL、HTTP 状态、重定向、内容类型和限流信息。
2. 已确认正确抓取类型：RSS、静态 HTML、JSON 接口、本地 CDP、Scrapling 或登录源。
3. 连续 3 次抓取均成功，每次取得配置数量的有效条目。
4. 条目标题非空、URL 可解析且本批次无重复。
5. 管理后台“测试”返回成功，并写入 `last_test_status=success`。
6. 只有完成以上验收后，网页源才设置 `automationEnabled: true`。
7. 数据库设置 `enabled=true` 后，定时任务能看到该源，且写库去重正常。

任何一步失败，都保持 `automationEnabled` 和数据库 `enabled` 为关闭状态。

## 二、诊断顺序

### 1. 原始访问

记录以下证据：

- `HEAD` 和 `GET` 的 HTTP 状态。
- 是否发生 301/302 跳转，以及最终 URL。
- `Content-Type`、响应大小、缓存和限流响应头。
- 是否出现验证码、登录墙、空壳 HTML 或地区限制。
- HTML 中是否有原生 RSS/Atom `<link>`。

不要先假设需要浏览器。能直接请求到正文列表时，优先使用普通网页抓取。

### 2. 类型判定

按以下优先级选择：

1. **原生 RSS/Atom**：直接使用 `fetch_type=rss`。
2. **服务端静态 HTML**：使用 `fetch_type=web` 和 `scrapeConfig`。
3. **页面调用公开 JSON 接口**：优先抓 JSON 接口。
4. **必须执行 JavaScript**：设置 `needsLocalCdp=true`，走本地 CDP。
5. **普通请求被反爬拦截，但无需登录**：再考虑 Scrapling。
6. **必须登录**：设置 `loginRequired=true`，不进入无人值守定时任务。

第三方 RSSHub 只能作为备选；公共实例不可达时，不应替代一个可直接抓取的静态页面。

## 三、网页选择器规范

网页源在 `lib/sources.ts` 中配置：

```ts
{
  id: 'source-id',
  name: '信息源名称',
  url: 'https://example.com/list',
  language: 'zh',
  priority: 'P1',
  type: 'web',
  automationEnabled: false,
  scrapeConfig: {
    itemSelector: '.news-list .news-item',
    titleSelector: 'a.title',
    linkSelector: 'a.title',
    linkPrefix: 'https://example.com',
    maxItems: 10,
  },
}
```

选择器要求：

- `itemSelector` 指向一个完整资讯条目，避免直接选择页面所有链接。
- `titleSelector` 和 `linkSelector` 应尽量指向同一个标题链接。
- 链接特征应限定到文章路径，例如 `href*="/article/"`。
- 不使用 `ul li`、`a[href]` 等全站宽泛选择器作为最终规则。
- `maxItems` 默认 10；列表不足 10 条时，按实际稳定数量设置。

## 四、本地验收

运行：

```bash
npm run test:source -- <source_id>
```

默认连续抓取 3 次。需要指定次数时：

```bash
npm run test:source -- <source_id> 5
```

命令只有在每次均满足以下条件时才返回成功：

- 提取数量等于 `maxItems`。
- 标题和 URL 非空。
- 本批次 URL 无重复。
- 抓取器没有超时、HTTP 或选择器错误。

通过后，将该源的 `automationEnabled` 从 `false` 改为 `true`。

## 五、后台与定时任务验收

部署代码后按顺序操作：

1. 信息源保持“停用”，先点击“测试”。
2. 确认提示“读取成功，共发现 N 条资讯”。
3. 刷新页面，确认“最近测试成功”。
4. 点击“启用”。
5. 手动触发一次 `/api/cron/fetch-and-process`。
6. 在返回结果的 `fetch.results` 中确认该源：
   - `ok=true`
   - `fetched>0`
   - `dead=0`
   - 没有 `error`
7. 查询 `articles`，确认标题、URL、发布时间和来源正确。
8. 再运行一次，确认相同 URL 不重复入库。

如果定时任务失败，立即将数据库 `enabled=false`；不要删除已验证配置，以便继续调试。

## 六、三文娱标准样例

### 诊断结果

- URL：`https://www.163.com/dy/media/T1460009632064.html`
- 类型：服务端静态 HTML。
- HTTP：200，无重定向。
- 不需要登录、CDP 或 Scrapling。
- 无原生 RSS/Atom。
- 列表页有限流响应头，调试请求应控制频率。

### 最终配置

```json
{
  "source_id": "sanwenyu-web",
  "is_rss": false,
  "needs_local_cdp": false,
  "needs_scrapling": false,
  "login_required": false,
  "scrape_config": {
    "itemSelector": ".list_box .js-item",
    "titleSelector": "a.title[href*=\"/dy/article/\"]",
    "linkSelector": "a.title[href*=\"/dy/article/\"]",
    "linkPrefix": "https://www.163.com",
    "maxItems": 10
  }
}
```

### 验收命令

```bash
npm run test:source -- sanwenyu-web
```

三次均输出 10 条有效资讯后，才允许设置：

```ts
automationEnabled: true
```

## 七、批量启用与定时轮转

批量处理“自动抓取已停用”信息源时，必须遵守：

1. 逐条在生产运行环境测试，只有取得至少 1 条有效资讯的源才写入 `enabled=true`。
2. 失败源保持停用，并把 HTTP 状态、超时、CDP、登录或选择器错误写入 `last_test_message`。
3. 定时任务不得一次串行抓取全部启用源。`fetch-and-process` 每次按稳定排序轮转 24 条，并在响应中返回：
   - `batchIndex`
   - `totalBatches`
   - `totalActiveSources`
   - `processedSources`
4. 需要复测指定批次时，管理员可请求 `/api/cron/fetch-and-process?batch=N`；不指定时按 Vercel 定时触发时段自动轮转。
5. 新增或减少启用源后无需手工重排；总批次数根据当前启用源数量自动计算。

本地 CDP 源不进入 Vercel 普通网页批次。Windows 任务 `CDPLocalDaily` 必须指向当前工作区的
`scripts/run-cdp-local.bat`，并由该启动器切换到项目根目录、加载 `.env.local` 后运行
`scripts/fetch-cdp-local.mjs`。迁移工作区后必须同时检查任务路径和最近运行结果。

## 八、单源调试交付模板

以后每个信息源的调试结果统一交付以下内容：

1. 访问诊断：状态码、最终 URL、限流/反爬、内容形态。
2. 类型结论：RSS / HTML / JSON / CDP / Scrapling / 登录。
3. 最终配置：完整可复制 JSON。
4. 修改文件：精确到文件和字段。
5. 三次抓取结果：数量、首条标题、首条 URL、发布时间。
6. 后台测试结果。
7. 定时任务结果与去重结果。
8. 是否已启用；未启用时写明唯一阻塞项。

## 九、HTTP 410 / 403 分类纠错 SOP

以后出现相同状态码时，按本节分流，不把“换 User-Agent 后偶尔成功”当作跑通。

### A. HTTP 410：原入口永久下线

410 表示原资源已被服务器明确移除。处理顺序：

1. 分别请求 HTTP、HTTPS，并记录最终 URL、状态码、响应体和重定向；两者均为 410 时停止重试旧入口。
2. 在同一站点查找仍在运行的新闻首页、站内搜索、RSS/Atom 和页面调用的 JSON 接口。
3. 优先级为：第一方 RSS/Atom → 第一方 JSON 接口 → 同站静态 HTML → 已认证转载账号；410 不进入 CDP/Scrapling 重试。
4. 新端点必须能识别来源、返回标题、文章 URL 和发布时间；文章 URL 至少抽查一条为 HTTP 200。
5. 在 `lib/sources.ts` 写入新 URL 和适配器配置，保留与数据库旧名称相同的 `name`，让 `findSourceConfiguration()` 自动替换旧 URL。
6. 运行 `npm run test:source -- <source_id> 3`，三次均达到 `maxItems` 才允许部署和启用。

#### 17173动漫已跑通样例

- 旧地址：`http://acg.17173.com/`，HTTP/HTTPS 均为 410。
- 新列表页：`https://search.17173.com/?keyword=%E5%8A%A8%E6%BC%AB`。
- 第一方接口：`https://search.17173.com/api/search/queryNews`。
- 必需参数：`keyword=动漫&pageNo=1&pageSize=10&orderBy=2`。
- 必需请求头：搜索页 `Referer`、浏览器 `User-Agent`、`Accept: application/json`。

```json
{
  "source_id": "17173-acg",
  "name": "17173动漫",
  "url": "https://search.17173.com/?keyword=%E5%8A%A8%E6%BC%AB",
  "is_rss": false,
  "needs_local_cdp": false,
  "needs_scrapling": false,
  "login_required": false,
  "scrape_config": {
    "adapter": "17173-search",
    "apiUrl": "https://search.17173.com/api/search/queryNews",
    "keyword": "动漫",
    "maxItems": 10
  }
}
```

### B. HTTP 403：区分站点防护和登录限制

处理顺序：

1. 用普通 GET、浏览器请求头和真实浏览器分别复测，记录响应大小、验证码/登录提示、Cookie 要求和地区限制。
2. 查看页面脚本和网络接口，查找该作者的公开 API、RSS、已认证账号页或同平台官方转载页。
3. 只接受能够校验作者身份的替代端点；搜索结果页必须能精确锁定来源，否则不能自动启用。
4. 找到公开且稳定的替代端点时，改为服务端 JSON/RSS/HTML 抓取，`login_required=false`、`needs_local_cdp=false`。
5. 没有公开替代端点且确实需要 Cookie 时，才设置 `login_required=true`、`needs_local_cdp=true`，交给本地 CDP；Vercel 不运行登录源。
6. 禁止通过高频重试、代理轮换或伪造 Cookie 绕过 403。三次连续测试和生产测试全部通过后才能启用。

#### 雷报已跑通样例

- 旧地址：`https://www.zhihu.com/people/wanshangkansha/posts`，匿名服务端请求为 HTTP 403。
- 已认证替代主页：`https://www.jiemian.com/account/2079.html`，HTTP 200，账号名称为“雷报”。
- 公开接口：`https://papi.jiemian.com/page/api/officialAccount/accountArticles`。
- 接口参数：`id=2079&page=1&callback=ipHotCallback`。
- 身份校验：只接收 `object_type=article` 且 `source_name=雷报` 的条目。

```json
{
  "source_id": "leibao-jiemian",
  "name": "雷报",
  "url": "https://www.jiemian.com/account/2079.html",
  "is_rss": false,
  "needs_local_cdp": false,
  "needs_scrapling": false,
  "login_required": false,
  "scrape_config": {
    "adapter": "jiemian-account",
    "apiUrl": "https://papi.jiemian.com/page/api/officialAccount/accountArticles",
    "accountId": "2079",
    "maxItems": 10
  }
}
```

### C. 统一验收与回退

1. 本地连续 3 次：每次条目数达到 `maxItems`，标题/URL 非空，本批 URL 无重复。
2. 抽查首条文章：HTTP 200，标题和来源一致，发布时间可解析。
3. Vercel 部署成功后，在管理页保持停用状态先点“测试”；只有 `last_test_status=success` 才启用。
4. 启用后手动运行一次抓取任务，确认 `fetched>0`、`dead=0`；再运行一次确认 URL 去重。
5. 任一步失败，立即回退数据库 `enabled=false`，保留诊断状态和错误信息，不回退到已经确认 410/403 的旧地址。
## 十、`选择器未提取到有效资讯` 专项纠错 SOP

此错误不得直接靠扩大选择器处理。必须先判定“页面没有文章链接”还是“抓取器拿到的根本不是新闻页面”。后续遇到相同报错，一律按以下流程执行。

### A. 固定诊断顺序

1. 保持信息源停用，记录测试时间、HTTP 状态、最终 URL、响应大小、`rawCount`、有效条数和报错原文。
2. 用与生产相同的 `User-Agent`、`Accept` 和请求方式抓取页面，检查 HTML 内是否存在 `a[href]`。禁止仅凭浏览器人工看到页面就判断静态抓取可用。
3. 若响应是验证脚本、挑战页、空壳 HTML，或页面没有文章链接：归类为 **反爬/JavaScript 页面**；停止调 CSS 选择器，设置 `needsLocalCdp: true`，并改走本地 CDP。
4. 若 HTML 有文章链接：先写出 URL 路径特征，再选择最小、稳定的文章选择器。禁止以 `ul li`、`article`、`a[href]` 等全站规则作为最终配置。
5. 用 `npm run test:source -- <source_id>` 连续验证 3 次。静态 HTML 源必须每次取得 `maxItems` 条标题、URL 非空且本批 URL 唯一。
6. 本地 CDP 脚本会按需启动隐藏的 Chrome（专用 9223 调试端口和独立用户目录）。使用 `node scripts/fetch-cdp-local.mjs --source <id> --dry-run` 验证 3 次；确认每次至少取得 10 条有效标题链接后，才允许进入定时任务。
7. 静态 HTML 源在后台“测试”成功后启用。CDP 源的后台测试只确认分流配置，真实抓取必须通过第 6 步；CDP 源由 `CDPLocalDaily` 任务执行，不再加入 Vercel 普通网页批次。

### B. 本次已跑通配置

#### 中国旅游报：静态 HTML

```ts
{
  id: 'ctnews',
  url: 'https://www.ctnews.com.cn/',
  type: 'web',
  needsLocalCdp: false,
  scrapeConfig: {
    itemSelector: 'a[href*="/content/20"][href*="content_"]',
    titleSelector: '',
    linkSelector: '',
    linkPrefix: 'https://www.ctnews.com.cn',
    maxItems: 10,
  },
}
```

证据：站点服务器响应为完整 HTML；该规则命中 106 个候选文章链接，并稳定提取前 10 条有效资讯。旧规则从宽泛 `li` 容器中优先取到导航链接，导致最终有效条数为 0。

验收命令：

```bash
npm run test:source -- ctnews
```

#### 浙江日报/潮新闻：本地 CDP

```ts
{
  id: 'zjol',
  url: 'https://www.zjol.com.cn/',
  type: 'web',
  needsLocalCdp: true,
  scrapeConfig: {
    itemSelector: '.newslist a[href]',
    titleSelector: '',
    linkSelector: '',
    linkPrefix: 'https://www.zjol.com.cn',
    maxItems: 10,
  },
}
```

证据：Vercel 同类请求返回 JavaScript 反爬校验页（约 8KB、0 个链接），因此不属于选择器问题；Chrome 渲染后 `.newslist a[href]` 命中 22 条正文列表链接，前 10 条均有标题和文章 URL。

本地验收命令：

```bash
node scripts/fetch-cdp-local.mjs --source zjol --dry-run
```

通过后由 Windows 任务 `CDPLocalDaily` 运行 `scripts/run-cdp-local.bat`。脚本会自动启动隐藏的 Chrome 9223 调试实例，不依赖人工打开浏览器或额外的 3456 代理服务。后台“测试”按钮只确认该源已正确分流到本地 CDP，不代表页面抓取验收；页面验收以连续 3 次 dry-run 为准。

## 十一、生产测试失败类型总表（2026-07-19）

以后先按错误原文归类，再执行对应动作。不得只改错误提示或把失败状态写成成功。

| 失败类型 | 判定要点 | 标准修复动作 | 本次样例 |
|---|---|---|---|
| `选择器未提取到有效资讯` | 响应为完整 HTML，但旧规则命中导航；或站点已不再提供资讯 | 前者改成文章路径精确选择器；后者清退错误数据 | 北青网、红星新闻、财政部已改；艺恩、猫眼清退 |
| `RSS 请求超时` | RSS 入口失效，但官网或第一方接口仍有数据 | 优先换第一方 JSON/HTML，禁止无限增加 RSS 超时 | 虎嗅改第一方文章接口 |
| HTTP `403/405/412`、`fetch failed` | 旧入口被 WAF、方法限制、TLS 或机房 IP 拦截 | 找同机构可访问栏目；省厅站被拦时可用文旅部官方省级转载栏目；仍需浏览器则分流本地 CDP | 国务院、北青、红星、浙江、东莞、天津、甘肃 |
| `login_required` | 原平台作者页匿名不可抓 | 只在能验证作者身份时换已认证公开账号/API；否则保留登录源停用 | 知乎雷报改界面新闻“雷报”账号 API |
| XML 解析错误、`Feed not recognized` | 数据库仍按 RSS 测试，但代码配置已改网页；或 RSS 地址已迁移 | 配置匹配后必须以代码配置的 `type` 覆盖数据库旧 `fetch_type`；再换最新地址 | Licensing International 改网页；Polygon 改 `/feed/` |
| `RSS 可访问，但没有有效资讯` | URL 是空壳/全站 feed，不是新闻 feed | 改抓官方新闻列表 HTML | ICOM、Museums Association |
| HTTP `404/410` | 路径已下线 | 找当前官方栏目或第一方 API；不能继续重试旧 URL | IGN Anime 分流当前栏目本地 CDP；17173 见第九节 |
| `Failed to parse URL from` | URL 为空，记录本身是阅读器/工具而非资讯发布方 | 从 `info_sources` 清退，不能补一个工具首页伪装成资讯 | RSSHub、Tiny Tiny RSS、The Old Reader、飞书订阅 |

### A. 类型覆盖回归规则

`info_sources.fetch_type` 是历史数据，`lib/sources.ts` 是已验证的运行配置。只要 `findSourceConfiguration()` 命中：

- 配置 `type: 'rss'` 时按 RSS 测试和抓取；
- 配置 `type: 'web'` 或 `type: 'gov'` 时按网页/适配器测试和抓取；
- 不得再让数据库旧 `fetch_type=rss` 把已修成网页的源送进 XML 解析器。

名称存在“全称/简称/地区后缀”时，在配置中写 `aliases`，例如 `北青网(北京青年报)`、`红星新闻(成都)`、`国务院政策文件库`。不要在数据库复制第二套抓取规则。

### B. HTTP 防护站点的替代顺序

1. 同域具体栏目页（根首页被拦时尤其要测试栏目页）。
2. 第一方 JSON 接口。
3. 同一政府机构的上级政府官方栏目或官方转载页。
4. 本地 CDP（必须真实 dry-run，Vercel 后台只确认分流）。
5. 没有上述路径时保持停用，不使用搜索引擎结果或非官方镜像冒充来源。

本次浙江、甘肃省厅根站分别返回 403/412，最终使用文化和旅游部的浙江、甘肃官方省级栏目；杭州西湖区官网仍受 WAF 限制，保留官方 URL并设置 `needsLocalCdp: true`，不进入 Vercel 普通网页批次。

### C. 本次稳定配置与三连测记录

| 信息源 | 最终类型/入口 | 规则或适配器 | 3 次结果 |
|---|---|---|---|
| 虎嗅 | JSON `article-api.huxiu.com/web/channel/articleList` | `huxiu-api` | 10 / 10 / 10 |
| 北青网 | `https://www.ynet.com` | `a[href*="ynet.com/20"]` | 10 / 10 / 10 |
| 红星新闻 | `https://www.cdsb.com` | `a[href*="/micropub/Articles/"]` | 10 / 10 / 10 |
| 国务院政策文件库 | `.../zhengceku/bmwj/home.htm` | `a[href*="content_"]` | 5 / 5 / 5 |
| 财政部 | `.../zhengwuxinxi/zhengcefabu/` | `a[href*="/202"][href*="t202"]` | 5 / 5 / 5 |
| 东莞文旅局 | `https://wglt.dg.gov.cn/` | `a[href*="/content/post_"]` | 5 / 5 / 5 |
| 天津文旅局 | `https://whly.tj.gov.cn/` | `a[href*="/202"][href*="t202"]` | 5 / 5 / 5 |
| 浙江省文旅厅 | 文旅部浙江栏目 | 精确日期文章路径 | 5 / 5 / 5 |
| 甘肃省文旅厅 | 文旅部甘肃栏目 | 精确日期文章路径 | 5 / 5 / 5 |
| 知乎雷报 | 界面新闻账号 API | `jiemian-account` + `expectedSourceName=雷报` | 10 / 10 / 10 |
| Licensing International | `licensinginternational.org/news/` | `.news-post-content a` | 10 / 10 / 10 |
| ICOM | `icom.museum/en/news/` | `a.news-abstract` | 10 / 10 / 10 |
| Museums Association | Museums Journal News | `.card-journal` | 10 / 10 / 10 |
| Polygon | `https://www.polygon.com/feed/` | RSS | 10 / 10 / 10 |

艺恩网、猫眼专业版以及四个阅读器/聚合工具不是可持续资讯源，验收动作是从生产 `info_sources` 删除并记录原因，不计作抓取成功。Anime News Network、IGN Anime、杭州西湖区政府属于本地 CDP 分流，必须保持在 Vercel 网页批次之外。
