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

## 七、单源调试交付模板

以后每个信息源的调试结果统一交付以下内容：

1. 访问诊断：状态码、最终 URL、限流/反爬、内容形态。
2. 类型结论：RSS / HTML / JSON / CDP / Scrapling / 登录。
3. 最终配置：完整可复制 JSON。
4. 修改文件：精确到文件和字段。
5. 三次抓取结果：数量、首条标题、首条 URL、发布时间。
6. 后台测试结果。
7. 定时任务结果与去重结果。
8. 是否已启用；未启用时写明唯一阻塞项。
