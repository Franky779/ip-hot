# 信息源：Vinyl Pulse（id: vinylpulse）

## 基础信息
- 网址：https://www.vinylpulse.com/（原 /feed 不可达）
- 分类：潮玩 / 玩具 / 收藏品（Designer toys 老牌）
- 抓取类型：web（原 rss / 曾按 cloud 调度）
- 状态：disabled / failed（2026-08-20 确认应改为 web，待重新启用验收）

## 症状
- 最近测试错误：`RSS 请求超时（30 秒）`
- 现象：RSS feed 请求超时；后续复测 RSS 也 `fetch failed`（不稳定/不可达）。

## 根因（已确认）
- RSS feed `https://www.vinylpulse.com/feed` 对服务器 fetch **不可达 / 不稳定**（本地复测 4 次 RSS 全失败）。
- 网页首页 `https://www.vinylpulse.com/` 稳定可抓（web 复测 2/3 成功，返回 10 条有效资讯）。
- 结论：正确抓取类型为 **web**（抓首页），不是 rss。

## 解法
### 方案 A（已采用）
- 类型：web
- URL：https://www.vinylpulse.com/
- scrapeConfig：`{ "adapter": "auto-news-links", "maxItems": 10 }`
- 说明：改抓首页静态 HTML，绕开不可达的 feed。已实测返回 10 条含真实文章链接（如 `/2025/11/buck-atom-by-slingshot.html`、`KAWS x SESAME STREET`）。

### 方案 B（备选）
- 若需更精准选择器，分析首页 DOM 后改用 `itemSelector/titleSelector/linkSelector/linkPrefix`。

## 验证结果
- 实测命令：`node --experimental-strip-types scripts/verify-sources-fetch.mjs`（vinylpulse 段）
- 实测条目数 / 是否通过：网页 10 条 / 通过（RSS 持续失败，佐证改 web）
- 落地状态：`lib/sources.ts` 已改 web + auto-news-links；DB 待重新启用验收

## 踩坑备注
- "RSS 请求超时/失败" 不一定代表源坏了，可能是 feed 地址不可达但网页正常 → 先分别测 RSS 和网页。
- Vinyl Pulse 是海外 Designer toys 老牌站，抓首页即可稳定获取新品资讯。
