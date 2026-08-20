# 信息源：爱范儿（id: ifanr）

## 基础信息
- 网址：https://www.ifanr.com/feed
- 分类：综合资讯 / 媒体
- 抓取类型：rss（保持 rss）
- 状态：disabled / failed（2026-08-20 已由 sanitizeAmpersand 修复，待重新启用验收）

## 症状
- 最近测试错误：`Invalid character in entity name` / `Line: 1774` / `Column: 255` / `Char: <`
- 现象：RSS 解析器报非法实体字符。

## 根因（已确认）
- feed XML 中某个 `<image>` 元素的 URL 末尾带**裸 `&`**（未转义成 `&amp;`），例如：
  `<image>https://ifanr.feishu.cn/...?code=...&</image>`。
  XML 解析器遇到 `&` 后期待实体名，但下一个字符是 `<`，于是报 `Invalid character in entity name ... Char: <`。
- 不是地址变更，不是编码问题，是**单个条目的畸形 XML**。

## 解法
### 方案 A（已采用，通用容错）
- 类型：rss
- URL：https://www.ifanr.com/feed（不变）
- 说明：在 `lib/rss.ts` 的 `parseFeedUrl` 里新增 `sanitizeAmpersand()`，把 XML 中 `&` 后不是合法实体（`&amp; &lt; &gt; &quot; &apos; #数字; #x十六进制;`）的裸 `&` 转义为 `&amp;`，再交给 rss-parser。此修复通用，对其它带裸 `&` 的源同样有效。
- 实测：`scripts/verify-sources-fetch.mjs` 复测成功（raw 20 valid 20）。

### 方案 B（备选）
- 若站点 feed 长期畸形，可改抓网页版 https://www.ifanr.com/ 用 `scrapeConfig`。

## 验证结果
- 实测命令：`node --experimental-strip-types scripts/verify-sources-fetch.mjs`（ifanr 段）
- 实测条目数 / 是否通过：20 条 / 通过
- 落地状态：`lib/rss.ts` 已加 `sanitizeAmpersand`；DB 待重新启用验收

## 踩坑备注
- 排查 "Invalid character in entity name" 的通用方法：抓原始 feed，定位报错行附近，找裸 `&` / 裸 `<` / 未闭合标签。
- rss-parser 底层是 xml2js，对畸形 XML 不友好，需在 parseString 前预处理。
