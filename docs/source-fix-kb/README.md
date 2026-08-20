# 信息源故障解法知识库（Source Fix KB）

> 用途：把信息源各种问题的解法沉淀成结构化条目，供「LLM 自动修复 API」(`/api/cron/source-llm-repair`) 在诊断时作为上下文注入，也让新对话/人工排障能直接查。
>
> 维护约定：每条解法必须「可实测验证」，不能是猜测。LLM 修复流程遵循：**LLM 只给建议 → 用 `runSourceTest()` 实测通过 → 才落地到配置**。

## 目录 / 索引

| 分类 | 说明 | 条目 |
|---|---|---|
| `rss-parse-error` | RSS 解析报错（非法字符、实体错误、格式问题） | 爱范儿、… |
| `rss-timeout` | RSS 请求超时 / 不可达 | Vinyl Pulse、… |
| `structure-changed` | HTML 结构变更，选择器失效 | … |
| `anti-scraping` | 普通请求被反爬拦截 | … |
| `js-rendered` | 必须执行 JS（SPA），需本地 CDP | … |
| `login-required` | 必须登录 | … |
| `jina-proxy-down` | 依赖的 Jina 代理失效 | … |
| `rsshub-fallback` | 转本地 RSSHub 兜底 | … |

## 条目模板（每个源一个文件，如 `entries/ifanr.md`）

以下字段结构固定，LLM 与人工共用。文件名用 `entries/<source-id>.md`。

```markdown
# 信息源：<名称>（id: <source-id>）

## 基础信息
- 网址：<URL>
- 分类：<行业分类>
- 抓取类型：<rss | web | gov | local-cdp | rsshub-fallback>
- 状态：<enabled | disabled> / <success | failed>

## 症状
- 最近测试错误：<原样复制 last_test_message>
- 其它现象：<超时/重定向/反爬/内容为空/结构变更…>

## 根因（LLM 诊断填写）
- <诊断结论：如"RSS XML 里含未转义实体导致 rss-parser 报错"，"站点对服务器 IP 限流导致超时"…>

## 解法
### 方案 A（首选）
- 类型：<rss | web | …>
- URL：<新地址或原地址>
- scrapeConfig（若 web）：<JSON>
- 说明：<为什么可行>

### 方案 B（备选）
- …

## 验证结果
- 实测命令：`npm run test:source -- <source-id>`
- 实测条目数 / 是否通过：<N 条 / 通过>
- 落地状态：<已落地到 lib/sources.ts + info_sources | 待人工确认 | 不适用>

## 踩坑备注
- <任何需要记住的细节>
```

## 规则库（LLM 修复 prompt 中追加的固定规则）

1. 不要信任 LLM 给出的 URL/选择器，必须用 `runSourceTest()` 实测，通过才落地。
2. 登录源 / 需要本地 CDP 的源：一律标记 `needs_human=true`，不自动启用（沿用 `decideRepairAction`）。
3. 第三方 RSSHub 只作备选，公共实例不可达时不能替代可直接抓取的静态页。
4. 结构变更优先改 `scrapeConfig`（`itemSelector/titleSelector/linkSelector/linkPrefix`），不要轻易改类型。
5. RSS 解析报错先怀疑 XML 实体/编码问题，其次才是地址变更。
