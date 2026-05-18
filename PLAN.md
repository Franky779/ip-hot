# 动漫IP/ACG/文创 行业新闻聚合站搭建计划

## 🔗 项目实际链接(Day 1-4 已就位)

| 资源 | 链接 / 标识 | 备注 |
|---|---|---|
| GitHub 仓库 | https://github.com/Franky779/ip-hot | Public, main 分支 |
| Vercel 部署 | **https://ip-hot.vercel.app** | Hobby 免费档(13 天 Pro Trial 后自动降级) |
| Supabase Project | `ip-hot` (Org: laojia-ip, FREE) | Singapore (ap-southeast-1) |
| 本地代码目录 | [d:/claudecode/临时文件夹/github网页/ip-hot/](d:/claudecode/临时文件夹/github网页/ip-hot/) | Next.js 14 + TS + Tailwind |
| 主域名(待集成) | laojia-ip.com | 已有,Day 22 配 `radar.laojia-ip.com` 子域名指向 Vercel |
| 后续推送脚本 | `ip-hot/_push_via_api.mjs` | github.com:443 不可达兜底,用 GitHub API 推 commit |
| LLM 提供商 | 超级斜杠 ricoxueai (OpenAI 兼容) | Day 12 接入 |

## Context(为什么做、解决什么)

用户是动漫IP/文创/ACG 行业自媒体从业者(艾克家族 DONO/吉米米品牌)。看到卡兹克(KKKKhazix)的 AIHOT 项目(aihot.virxact.com)后,希望复刻一个**面向自己行业的版本**:每天自动抓取行业新闻 → LLM 生成中文摘要 → 按版块归类 → 网站自动展示 + 每日早 8 点生成日报。

这能帮用户:
- 把零散的行业资讯做成对外作品集,提升 IP 顾问专业形象
- 沉淀的数据反哺现有 ip-news skill、anime-ip-article-creation 文章创作
- 网站本身可作为合作方/客户的"行业雷达"产品

调研发现的关键事实:
- KKKKhazix/khazix-skills/aihot **不是网站源码**,只是 Claude Skill 协议(教 Agent 调用 aihot 公开 API)
- 真正的 aihot.virxact.com 后端**未开源**,只能从 SKILL.md 和 OpenAPI 反推架构
- 反推架构: PostgreSQL + pg_trgm 索引 + Nginx + cuid ID + LLM 摘要管线 + 每天 UTC 0 点(北京 8 点)切日报 + 7 天滚动 items 池

用户已做的关键决策(已通过 AskUserQuestion 确认):
1. **网站定位**: 对外公开 SEO 站(独立域名、可对外宣发)
2. **技术路径**: Vercel + Supabase(aihot 同款栈)——**用户选了最接近 aihot 的方案**
3. **MVP 信源**: 先跑 5-8 个 RSS,稳了再扩
4. **LLM 月成本上限**: 30-50 元/月(用 Claude Haiku 4.5 类小模型)
5. **集成方式**(2026-05-10 追加): 与现有"新文创老贾聊IP"主站(d:\claudecode\临时文件夹\github网页\本地待确认版本\)**动静分离**——主站静态零改动,新站独立部署到子域名,主站 sidebar 在第 4 周末追加一个跳转按钮
6. **新栏目命名**: "IP行业雷达"
7. **域名结构**: 主站走主域名(待用户确认/购买),新站走子域名 `radar.<主域名>`
8. **上线时机**: 先建新站,4 周内跑稳了再让 sidebar 出现新按钮(零风险给主站)

---

## 与现有主站的集成方案(动静分离)

### 主站现状(只读,不改)

`d:\claudecode\临时文件夹\github网页\本地待确认版本\` 是纯静态站,6 个 HTML 页面 + 共享 sidebar:

| 页面 | 当前 sidebar 项 (来自 update-nav.js navItems) |
|---|---|
| index.html | 首页 |
| ip-database.html | 案例盘点&数据分析 |
| weekly-news.html | 行业资讯汇总 |
| articles.html | 老贾有话说 |
| subscribe.html | 订阅 |
| about.html | 关于老贾 |

主站继续用现有部署方式(GitHub Pages 或现有 Vercel 静态托管)。

### 新站独立部署

- 新仓库名建议: `ip-radar`
- 框架: Next.js 14 + Tailwind + shadcn/ui
- 部署: Vercel
- 数据库: Supabase
- 域名: `radar.<老贾主域名>.com`
- 视觉: **复用主站 [shared.css](d:/claudecode/临时文件夹/github网页/本地待确认版本/shared.css) 的色板/字体/sidebar 样式**,让新站看起来跟主站是"同一家"
  - 复制 shared.css 的 CSS 变量(`--accent`、`--surface`、`--sidebar-*` 系列)到新项目 `globals.css`
  - 字体保持 `Noto Serif SC` + `Noto Sans SC` 一致
  - 新站自己的左侧 sidebar 也加 6 个旧站链接(指回主站),实现双向跳转

### Sidebar 集成(第 4 周末执行)

主站 sidebar 加一个按钮,**改动只有 1 处**:

文件: [d:\claudecode\临时文件夹\github网页\本地待确认版本\update-nav.js](d:/claudecode/临时文件夹/github网页/本地待确认版本/update-nav.js#L7-L20)

在 `navItems` 数组里追加一项(放在 'weekly' 之后,'articles' 之前,逻辑相邻):

```javascript
{ id: 'radar', href: 'https://radar.<主域名>.com', label: 'IP行业雷达',
  icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="6" fill="none" stroke-dasharray="2 2"/>' },
```

跑一次 `node update-nav.js`,6 个 HTML 自动同步。**主站本身的 HTML/CSS/JS 内容一字不改**,只是 sidebar 多了一个按钮。

### 视觉一致性细节

- 新站的 sidebar 使用与主站完全相同的 220px 宽 + 深色背景 + 同款图标线条
- 新站 sidebar 顶部 brand 用"贾"字图标 + "新文创老贾聊IP"文字(同主站)
- 新站 sidebar 底部主题切换器(浅/深/系统)沿用主站 JS 逻辑
- 新站每页都有"返回主站"链接,把"首页/案例盘点/资讯汇总/有话说/订阅/关于"6 项也展示在 sidebar 里(只是 active 项不同),用户感知是"同一个站,只是切到雷达版块"

---

## 核心思路(一句话)

把 aihot.virxact.com 在 IP/ACG 行业重做一遍,**全部由 Claude Code 带做**——用户不写一行代码,只负责审稿、调 prompt、决策方向;具体的 Next.js/Supabase/Vercel/GitHub Actions 操作我(Claude Code)逐步生成代码 + 部署指令,用户复制粘贴执行即可。

---

## 技术栈(锁定版)

| 层 | 选型 | 理由 | 月成本 |
|---|---|---|---|
| 前端 | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui | aihot 同款,最大社区,Vercel 原生支持 | 0 |
| 部署 | Vercel(免费 Hobby 套餐) | 自动 HTTPS、Cron Jobs、Preview Branch | 0(免费档够) |
| 数据库 | Supabase Postgres(免费档 500MB) | aihot 同款,含 Auth/Storage/RestAPI | 0(免费档) |
| 抓取调度 | Vercel Cron Job(每 30 分钟触发) | 不用自己搭服务器,免费 100 次/天 | 0 |
| RSS 解析 | Node.js `rss-parser` 库 | 5 行代码搞定 | 0 |
| 反爬源 (备用) | 自建 RSSHub Docker(本地 PC,需要时启动) | 处理微信公众号、微博等无原生 RSS 的源 | 0 |
| LLM 摘要 | Claude Haiku 4.5(`claude-haiku-4-5-20251001`) | 速度+价格平衡,中文质量好 | 30-50 元 |
| 域名 | 阿里云/Cloudflare Registrar 注册 .com | 可选 .ai/.news 等更贵后缀 | 60 元/年 ≈ 5 元/月 |
| CDN/SEO | Cloudflare(可选) | 抗攻击 + 全球加速 | 0 |
| **合计** | — | — | **35-55 元/月** |

---

## MVP 信源池(从用户已有 ip-news 里精选 8 个 RSS 起步)

复用 [d:\\claudecode\\.claude\\skills\\ip-news\\references\\info-sources.md](d:/claudecode/.claude/skills/ip-news/references/info-sources.md) 第三章已验证的 RSS 列表,挑出**全部官方 RSS、无需 RSSHub、稳定性最高**的 8 个作为 MVP:

| 优先级 | 站点 | RSS 链接 | 类型 |
|---|---|---|---|
| P0 | Anime News Network | https://www.animenewsnetwork.com/all/rss.xml | 海外动漫旗舰 |
| P0 | Crunchyroll News | https://feeds.feedburner.com/crunchyroll/animenews | 流媒体官方 |
| P0 | Cartoon Brew | https://www.cartoonbrew.com/feed | 全球动画产业 |
| P0 | Animation World Network | https://www.awn.com/news.xml | 动画 B 端新闻 |
| P0 | Variety | https://variety.com/feed | 好莱坞产业 |
| P1 | 36氪 | https://36kr.com/feed | 国内创投 |
| P1 | 虎嗅 | https://www.huxiu.com/rss/0.xml | 国内深度评论 |
| P1 | 钛媒体 | https://www.tmtpost.com/rss.xml | 国内科技商业 |

5 个海外 + 3 个国内,英中混合——LLM 摘要环节统一翻译为中文。MVP 跑稳后,第 4 周开始扩展 P2 信源(动漫之家、三文娱公众号、Comic Natalie、Famitsu 等)。

---

## 网站版块设计(5 大板块,IP/ACG 行业版)

| 版块 | 对应 LLM 分类 prompt | 预期内容 |
|---|---|---|
| 新作发布 | "动画/漫画/游戏新作开播、立项、PV 发布" | 番剧、漫画连载、游戏新作 |
| IP 授权 | "授权合作、跨界联名、品类拓展、版权交易" | 代理协议、联名快讯、海外授权 |
| 潮玩谷子 | "盲盒、手办、谷子(顶坑)、设计师玩具新品" | 泡泡玛特/52TOYS 类信息 |
| 展会活动 | "China Joy/AnimeJapan/CCG/CLE 等展会、漫展、Cosplay 活动" | 时间表 + 现场报道 |
| 文旅及商品 | "文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、景区联名、文化遗产数字化" | 文旅动态、博物馆文创、旅游商品 |
| 待分类 | "无法归入以上5类的资讯，等待人工复核" | 待管理员手动归类 |

每条新闻经 LLM 处理后产出 5 个字段:
1. `title_cn`(中文标题,翻译/改写)
2. `summary_cn`(80 字以内中文摘要)
3. `category`(5 选 1)
4. `relevance_score`(0-10,IP/ACG 商业相关性,< 5 不展示)
5. `is_selected`(>= 7 进首页精选)

---

## 4 周分阶段实施

> **2026-05-10 调整**:工期从 4 周延长到 **6 周(30 个工作日)**,因为每天 30-60min 挤进现有日程更现实。**详细的 30 天逐日子任务以 [每日提醒.md](d:/claudecode/[1]个人助理/[1.1]每日提醒/每日提醒.md) "🛰️ 长期工作项目: IP行业雷达搭建" 章节为准**(已写入)。本节下面的 4 周表格保留作为里程碑参考。
>
> **LLM 决策**:用户没有 Anthropic API,改用**超级斜杠(ricoxueai)** 中转(OpenAI 兼容格式)。第 3 周 Day 12 接入。
>
> **主域名**:`laojia-ip.com`(已确认),新站子域名 `radar.laojia-ip.com`,DNS 在 Day 22 配。

### 第 1 周:环境准备 + 抓取 PoC

| Day | 动作 | 工具 | 验证标准 |
|---|---|---|---|
| 1 | 注册 Vercel(GitHub 登录)、Supabase(GitHub 登录)、阿里云域名 | 浏览器 | 三个账号都能登录 |
| 2 | Claude Code 帮你建 Next.js 项目骨架,推到 GitHub 新仓库 | Claude Code + gh CLI | 仓库 push 成功 |
| 3 | Vercel 关联仓库,首次部署 hello-world 页 | Vercel Dashboard | 拿到 .vercel.app 域名,首页能打开 |
| 4 | Supabase 建表(`articles` 表,字段对照 aihot 字段:id/title_cn/summary_cn/category/relevance_score/is_selected/source/url/published_at) | Supabase Dashboard SQL Editor | 表能查询(空数据) |
| 5-7 | 写抓取脚本(`/api/cron/fetch-rss`),拉取 1 个 RSS 源(ANN),解析后写入 Supabase | Claude Code 帮你生成代码 | Vercel 日志能看到"抓到 N 条新闻"且 Supabase 表里有数据 |

**卡点应对**:
- Vercel 部署失败 → Claude Code 看日志,99% 是 package.json 配置问题
- Supabase 连接超时 → 多半是环境变量没配 `SUPABASE_URL`/`SUPABASE_KEY`
- RSS 解析失败 → 该源可能用了非标准格式,换下一个

### 第 2 周:LLM 摘要管线 + 5 个 RSS 全跑通

| Day | 动作 | 验证标准 |
|---|---|---|
| 8-9 | 接入 Claude Haiku API(用户已有 ANTHROPIC_API_KEY 或现注册),写 LLM 摘要函数,处理 1 条新闻能产出 5 个字段 | Supabase 有 1 条带 `title_cn`/`summary_cn`/`category` 的记录 |
| 10-11 | 把 5 个 P0 海外 RSS 全挂上,跑一次完整流程 | Supabase 当天有 30-80 条新数据 |
| 12 | 加去重逻辑(按 `source + url` 唯一索引),防止重复抓取 | 重复跑 cron 不会产生重复数据 |
| 13-14 | 加 LLM 失败重试 + 降级(Claude 挂了切到 OpenAI mini;两个都挂了把原标题前 60 字直接当摘要) | 故意断网测试,数据仍能落库(只是没翻译) |

### 第 3 周:前端展示 + 域名 + 上线

| Day | 动作 | 验证标准 |
|---|---|---|
| 15-17 | 用 v0.dev 生成首页 UI(Claude Code 把"5 版块卡片流"+"每日精选 Hero"+"日报存档"3 个区块的需求贴给 v0.dev),复制代码到项目 | 本地预览页面能看到样式 |
| 18-19 | 接入真实数据(从 Supabase 读取),按 `is_selected` 筛精选,按 `category` 分版块 | 网站能看到当天抓的真实新闻 |
| 20 | 接域名(阿里云/Cloudflare DNS 指 Vercel) | 自己的域名能打开网站 |
| 21 | SEO 基础(`<title>`/`<meta>`/`sitemap.xml`/`robots.txt`/`og:image`/JSON-LD) | Google Search Console 能验证站点 |

### 第 4 周:自动化 + 日报 + 信源扩展

| Day | 动作 | 验证标准 |
|---|---|---|
| 22-23 | Vercel Cron Job 配置每 30 分钟跑一次抓取 + LLM | Vercel 后台能看到每 30 分钟一次成功调用 |
| 24-25 | 加"每日 8 点日报"功能(Vercel Cron 每天 0:00 UTC 跑,把过去 24h `is_selected=true` 的新闻打包成 markdown 存档进 Supabase `daily_reports` 表 + 生成 `/daily/2026-05-11` 路由展示) | 第二天早 8 点能看到当天日报 |
| 26 | 加飞书通知(用 lark-cli 把每日日报推送到你的飞书群/IM) | 早 8 点飞书收到推送 |
| 27 | 扩展 P1 国内 3 个 RSS(36 氪、虎嗅、钛媒体)上线 | 当天数据涨到 100+ 条 |
| 28 | 写运营 README(怎么换信源、怎么调摘要 prompt、怎么看错误日志),交付 | 用户独立维护无障碍 |

---

## 关键决策点(实施时再细化)

1. **域名选什么**: `.com` 60 元/年最稳;`.news`/`.ai` 200-500 元/年但更贴主题。推荐先 `.com`,品牌起来再加买
2. **首页 UI 风格**: 模仿 aihot 极简风 / 杂志风(类似 Variety) / 二次元风(参考 Anime News Network)。建议第 3 周让 v0.dev 生成 3 版,你挑 1 版
3. **数据要不要回流飞书**: 强烈建议要——飞书表是你的主工作流,网站和飞书表双向同步用户更顺手。第 4 周做
4. **是否开放投稿**: 不开。开放投稿要做后台审核 + 反垃圾,工作量翻倍
5. **法律风险**: 只展示"标题+AI 摘要+原文链接",不存全文,符合"链接型聚合"惯例(参考早期今日头条)

---

## 月成本细账(MVP 阶段)

| 项 | 成本 |
|---|---|
| Vercel Hobby | 0 元 |
| Supabase Free | 0 元 |
| GitHub | 0 元 |
| Cloudflare DNS | 0 元 |
| 域名 .com | 5 元/月(60元/年) |
| Claude Haiku API | 30-50 元/月(按每天 80-200 条新闻摘要,每条约 0.005 元) |
| **合计** | **35-55 元/月** |

第一年总投入: 域名 60 + LLM 约 480-720 = **540-780 元**

---

## 风险与降级方案

| 风险 | 应对 |
|---|---|
| RSS 源失效 | 监控脚本检测连续 3 天无新数据自动告警,周维护时人工换源 |
| Vercel 免费档超量(Cron 100次/天上限) | 改成每小时 1 次,够用 |
| Supabase 500MB 满 | 30 天前的旧数据导出存 GitHub 仓库 archive 文件夹 |
| LLM API 涨价/限流 | 多 provider 备用(Claude/OpenAI/通义千问) |
| 网站被反爬 | Vercel 自带防护够;真要被打,关 Cloudflare 5 秒盾 |
| 用户没时间维护 | 网站挂掉不影响数据,Supabase 库随时能重建网站 |

---

## Critical Files(实施时会创建/修改的关键文件)

- `d:\claudecode\<新建仓库目录>\` (待定项目目录,与用户确认后建)
  - `app/page.tsx` - 首页
  - `app/api/cron/fetch-rss/route.ts` - 抓取定时任务
  - `app/api/cron/daily-report/route.ts` - 日报生成
  - `lib/llm.ts` - LLM 摘要函数
  - `lib/supabase.ts` - 数据库连接
  - `lib/sources.ts` - 信源配置(对应 ip-news 的 info-sources.md 子集)
  - `vercel.json` - Cron 配置
  - `.env.local` - 环境变量(API key,不进 git)
- `d:\claudecode\.claude\skills\ip-news\references\info-sources.md` - **复用为信源池**
- 新建仓库 `KKKKhazix/khazix-skills` 风格的 GitHub repo(在用户的 GitHub 账户下)

---

## Verification(怎么验证整个项目跑通)

1. **抓取链路**: Vercel Dashboard 看 cron 日志,每 30 分钟一次成功调用,Supabase `articles` 表数据持续增长
2. **LLM 摘要**: 随机抽 10 条记录,中文标题/摘要无明显错译,`category` 分类准确率 > 80%
3. **网站展示**: 自己的域名打开,5 个版块都有内容,首页精选 5-10 条
4. **每日日报**: 第二天早 8 点 `/daily/<日期>` 路由有内容,飞书 IM 收到推送
5. **SEO**: Google Search Console 提交 sitemap,7 天后 site:你的域名 能搜到收录页

---

## 我的执行建议

**别一上来全做**。我建议**先把第 1 周做完再说**——这一周成本几乎 0,只是注册账号 + 部署 hello-world + 抓 1 个 RSS。如果你卡在某一步觉得"这事不靠谱",停下来零损失。第 1 周顺利再进第 2 周。

下一步行动:
1. 你确认这份 plan(或调整版块/信源/UI 方向)
2. 我帮你列**第 1 周第 1 天的具体动作清单**(精确到"打开哪个网址、点哪个按钮")
3. 一步一步推进
