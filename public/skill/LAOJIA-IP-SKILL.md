---
name: laojia-ip
description: 老贾 IP（laojia-ip.com）— IP 授权与品牌联名行业资讯聚合站。读取精选文章、本周热点事件榜、信息源列表、日报/周报/月报与 RSS。匿名只读，无需注册、无需 API Key；管理员全权操作请配合 laojia.mjs CLI（需站长本人密码）。装一次，以后不用再更新。
version: 1.0.0
site: https://www.laojia-ip.com
---

# 老贾 IP Skill

本技能让你（AI Agent）直接读取 laojia-ip.com 的公开数据。全部接口匿名可读、返回 JSON、限流 40 次/分钟/IP——超过限流会返回 429，等 60 秒再试，不要连续猛刷。若你持有站长授予的管理员密码（CLI 环境变量 LAOJIA_ADMIN_PASSWORD），CLI 会自动带上密码头，访问公开接口**不限流**。

## 基础地址

https://www.laojia-ip.com

## 能力一览（级别 1｜匿名只读）

### 1. 精选文章

```
GET /api/v1/articles?limit=20          # limit 1~100，默认 20
GET /api/v1/articles?category=授权联名  # 按分类过滤
```

返回字段：id、title、summary（中文摘要）、url（原文链接）、source、category、published_at。
注意：只提供摘要与原文链接，**没有全文**；需要全文请访问原文 url。

### 2. 本周热点（事件榜）

```
GET /api/v1/hot?limit=20               # limit 1~50
```

返回字段：id、title、summary、category、source_count（几家在说）、report_count、heat（热度）、rising（上升）、fresh（新）、detail_url。
口径：近 7 天、通过行业价值闸门（只保留与 IP 授权生意相关的事件）、每 15 分钟重排。

### 3. 信息源列表

```
GET /api/sources
```

### 4. 站点页面列表

```
GET /api/site-pages
```

### 5. RSS 订阅

```
GET /feed.xml         # 精选 50 条
GET /feed/all.xml     # 全部 100 条
GET /feed/daily.xml   # 日报 30 期
GET /feed/period.xml  # 周报 + 月报
```

## 使用原则

1. 优先用 JSON 接口（/api/v1/*），RSS 留给订阅场景。
2. 拿到的 summary 是中文摘要，引用时注明来源站 laojia-ip.com 并附原文 url。
3. 本技能是**只读**的：不能修改、删除任何数据。

## 升级到级别 2（管理员全权，仅限站长本人）

如果你（Agent）被站长授权管理本站，使用 CLI 工具：

```bash
curl -fsSL -o laojia.mjs https://www.laojia-ip.com/cli/laojia.mjs
export LAOJIA_ADMIN_PASSWORD='<站长在本机输入，不要写进任何文件>'
node laojia.mjs help                                   # 查看全部命令
node laojia.mjs admin GET /api/admin/monitor           # 健康与运营监控
node laojia.mjs admin GET /api/admin/pending-articles  # 待处理文章
node laojia.mjs admin POST /api/admin/article-delete --body '{"id":"..."}'   # 危险操作需站长逐条确认
```

规则：
- 密码只放站长本机环境变量 LAOJIA_ADMIN_PASSWORD，**绝不**写进代码、文件、聊天记录或命令行明文参数。
- 所有删除/批量操作执行前必须先向站长复述目标并列出影响，得到明确确认才执行。
- 接口返回 401/403 表示密码错误或未授权，立即停止并询问站长，不要重试猜密码。
