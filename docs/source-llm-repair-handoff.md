# IP-HOT 信息源 LLM 自主修复系统 — 项目交接文档

> 交接日期：2026-08-20
> **2026-08-23 更新：全部任务已完成。** SSH 已恢复（网段白名单），系统已部署上线，定时器已接入，overdue 已纳入修复，另有 4 个本地 CDP 源成功云端化（AWN/KidScreen/Kidscreen Consumer/Artnet）。
> 交接人备注：以下信息已通过实测/SSH 核验，claudecode 可直接按此继续，无需重新摸索。

---

## 0. 一句话总览

当前进行中的是 **「信息源 LLM 自主修复系统」** 的开发与部署：用大模型（服务器上已配置的 DeepSeek/Kimi）读取一个**信息源故障解法知识库**，自动诊断失效信息源、给出新配置，**经真实抓取实测通过后才落地**，全部运行在腾讯云服务器（不依赖本机开机）。

代码骨架**已完成并提交、已推 GitHub**，但**尚未部署到服务器**，且当前 **SSH 无法连接（阻塞点）**。另外两个具体信息源（爱范儿、Vinyl Pulse）的修复已在代码层完成，需部署后落地到数据库并验收。

---

## 1. 已完成进度（✅）

### 1.1 代码改动（本地已 commit，HEAD=`c6401b6`）
已提交的 commit `c6401b6` 包含 9 个文件：

| 文件 | 内容 |
|---|---|
| `lib/rss.ts` | 新增 `sanitizeAmpersand()`：修复 XML 中裸 `&` 导致的 `Invalid character in entity name` 报错（爱范儿等） |
| `lib/sources.ts` | Vinyl Pulse 由 `rss` 改 `web`（feed 不可达，首页稳定），`scrapeConfig: {adapter:'auto-news-links', maxItems:10}` |
| `lib/rss.test.ts` | `sanitizeAmpersand` 单元测试（6 用例） |
| `lib/source-llm-repair.ts` | **LLM 修复核心**：读知识库→诊断→`runSourceTest()`实测兜底→落地 |
| `app/api/cron/source-llm-repair/route.ts` | **LLM 修复 API**：`GET /api/cron/source-llm-repair?dryRun=1&limit=N` |
| `docs/source-fix-kb/README.md` | 知识库模板 + 索引 + 规则库 |
| `docs/source-fix-kb/entries/ifanr.md` | 爱范儿条目（根因+解法已回填） |
| `docs/source-fix-kb/entries/vinylpulse.md` | Vinyl Pulse 条目（根因+解法已回填） |
| `package.json` | 新增 `"test:rss": "node --experimental-strip-types --test lib/rss.test.ts"` |

### 1.2 本地验证（✅ 全部通过）
- `eslint`（改动文件）：0 错误
- `npm run test:rss`：6/6 通过
- `npm run test:deployment`：5/5 通过
- `npm run test:source-repair`：7/7 通过
- `lib/source-config-regression.test.ts`：18/18 通过
- `npm run build`：通过（需临时移走 `public/ipbrand/images` junction，见 5.1 节踩坑）
- **真实抓取实测**：爱范儿 RSS 从失败→成功 20 条；Vinyl Pulse RSS 持续失败但网页版稳定（2/3 成功 10 条）→ 确认改 web

### 1.3 GitHub 备份（✅ 已推送）
- 本地 HEAD `c6401b6` → GitHub commit `2e74efdd`，tree `7ded8b45`，**本地/GitHub tree 已核对一致**
- GitHub 部署用 SHA：**`2e74efdd`**（服务器拉包用这个）

### 1.4 既有基线（上一个会话已完成，已上线）
- 一键抓取按钮实时进度（`e7b2bdc`，release `20260820-185301`）
- nginx 域名证书修复（`59fc4c7`/GitHub `f2b189be`，`www.laojia-ip.com` 证书已正常）
- 主站域名：`https://www.laojia-ip.com/`（`hot`/`laojia-ip.com` 均 301 到 www）

---

## 2. 未完成任务（❌ 待 claudecode 接续）

### 2.1 【阻塞】SSH 无法连接（必须最先解决）
**现象**：`ssh root@101.32.211.198` 持续 `Connection timed out`（TCP 22 偶尔能通，但 SSH 协议握手被丢弃）。
**根因（已诊断）**：本机宽带是**运营商级 NAT（CGN）**，出口 IP 不稳定，不同服务探测到不同 IP：
- `ip.sb` → `116.77.75.248`
- `ifconfig.me` → `120.240.178.200`
- open 脚本检测 → `120.240.178.136`

一键开门脚本 `D:\claudecode\.claude\scripts\ip-hot-ssh-open.py` 只把**一个** IP 加白名单，SSH 实际流量从另一个未放行的 IP 出去 → 握手被防火墙丢弃。

**用户已选择方案 A**：把防火墙 22 端口白名单放宽到**管理网段 `120.240.178.0/24`**。

**注意**：open 脚本第 122 行 `ip_already_allowed()` **已经识别 `/24` 网段**（若白名单已有 `120.240.178.0/24` 则判定已放行），且第 155 行 `cleanup_stale_rules` **会保留 `120.240.178.x` 网段规则**。但脚本**当前只会添加 `/32` 单 IP**（第 224 行 `CidrBlock: ip + '/32'`），**不会主动添加 `/24` 网段**。

**建议做法（给 claudecode）**：
1. 修改 `ip-hot-ssh-open.py`，把第 224 行改为添加 `120.240.178.0/24`（而非 `/32`），或者新增一个 `--segment` 参数用于添加管理网段。
2. 或者直接调用腾讯云 API `CreateFirewallRules` 添加 `CidrBlock: '120.240.178.0/24'`（脚本里 `call_api` 已封装好签名，可复用）。
3. 添加后重新测 `ssh -o BatchMode=yes -o ConnectTimeout=20 root@101.32.211.198 "hostname"`。
4. 若仍然不通，考虑**方案 B**：让用户到腾讯云控制台 → 轻量应用服务器 → laojia-ip → 登录（OrcaTerm/TAT 网页终端），在网页终端里执行部署脚本（网页终端不走 22 端口）。

### 2.2 【部署】把 `c6401b6` 部署到腾讯云服务器
按 SOP（`a.服务器配置文件/腾讯云部署SSH-SOP.md`）执行：
1. 一键开门脚本（需先解决 2.1）
2. SSH 连通确认
3. 服务器拉包：`SHA=2e74efdd`
   ```bash
   cd /root
   curl -fsSL -o ip-hot-release-$SHA.tar.gz https://codeload.github.com/Franky779/ip-hot/tar.gz/$SHA
   ```
4. 解包重打包（关键！codeload 包带顶层套壳目录 `ip-hot-<sha>/`，必须 `--strip-components=1` 后重新 tar 再喂 install-release）：
   ```bash
   mkdir -p /tmp/ip-hot-rel && rm -rf /tmp/ip-hot-rel/*
   tar -xzf /root/ip-hot-release-$SHA.tar.gz -C /tmp/ip-hot-rel --strip-components=1
   cd /tmp/ip-hot-rel && tar -czf /root/ip-hot-release-$SHA-repacked.tar.gz .
   bash /tmp/ip-hot-rel/ops/scripts/install-release /root/ip-hot-release-$SHA-repacked.tar.gz
   ```
5. 服务器健康检查：`/usr/local/sbin/ip-hot-health-check` 期望 `home=200 sources=200 site_pages=200 monitor=200`

### 2.3 【落地】把爱范儿、Vinyl Pulse 两源的修复落地到数据库并验收
**背景**：这两个源在 `info_sources` 表里存在但 `enabled=false`、`last_test_status=failed`。代码已修复（爱范儿靠 `rss.ts` 全局容错；Vinyl Pulse 已改 web），但**数据库里的 url/fetch_type 还是旧配置**，需要更新。

**需要做的（SSH 连上后）**：
1. 查两个源当前 DB 行：
   ```sql
   select id,name,url,type,fetch_type,enabled,last_test_status,method from info_sources where name ilike '%爱范%' or name='Vinyl Pulse';
   ```
2. 更新 Vinyl Pulse 的 DB 行：`url='https://www.vinylpulse.com/'`, `fetch_type='web'`。
3. 用 `lib/source-llm-repair` 或直接调测试接口验证两源能成功。
4. 重新启用（`enabled=true`）后，确认定时抓取能写入。

> **注意**：`findSourceConfiguration()`（`lib/sources.ts`）能通过 `url`/`name` 匹配到代码配置。Vinyl Pulse 现在在代码里有 web 配置，匹配后会覆盖 DB 的 fetch_type。**爱范儿在代码 `lib/sources.ts` 里没有独立条目**（只有 DB 行），它的修复靠 `rss.ts` 全局 `sanitizeAmpersand`，DB 行保持 rss 即可。

### 2.4 【验证】云端跑通 LLM 修复链路（dryRun）
部署后，用新 API 跑一次 dryRun，确认 LLM 能真实调用：
```bash
# 服务器内
ADMINPW=<从 shared env 读，不打印值>
curl -s "http://127.0.0.1:3101/api/cron/source-llm-repair?dryRun=1&limit=5" -H "x-admin-password: $ADMINPW"
```
期望返回每个 failed 源的 `proposal`（LLM 诊断+建议）和 `verified`（实测结果）。若 LLM key 正常，会真实调用 DeepSeek/Kimi。

> **本机限制**：`lib/source-llm-repair.ts` 的模块链用 `@/lib/...` 别名和无后缀 `.ts` import，无法用 `node --experimental-strip-types` 直接跑；且本机 `.env.local` 缺 `LLM_BASE_URL`。所以**完整 LLM 链路只能在服务器（Next.js 运行时 + 完整 key）验证**。已在本地验证的是闭环里的"实测兜底"环节（`runSourceTest` 真实抓取）。

### 2.5 【接入定时器】给 LLM 修复加定时调度 —— ✅ 已完成（2026-08-23）
1. 已新增 `ops/systemd/ip-hot-source-llm-repair.service/timer`：每天 09:15/21:15 各一次（RandomizedDelaySec=300，Persistent），复用 `curl --config /srv/apps/ip-hot/shared/curl-auth.conf` 鉴权。
2. `install-release` 已加入该 timer 的 `enable --now`，后续部署保持启用。
3. API 自带 120 分钟防重入锁（cron_logs）+ 每轮上限 5 源。

### 2.6 【已回答+已落地】overdue 逾期未抓源（2026-08-23）
**overdue 定义**：源今天有计划抓取时间且已过点，但今天一次运行记录都没有（不是"跑了失败"，是"没跑"）。常见原因：调度没轮到 / 本地 CDP 源电脑没开机 / 源失效被停用。

**已落地两件事**：
1. **修复 `ip-hot-coverage-repair` 持续失败**（原已知事项 #22）：根因是「推特-52TOYS官方」DB method 标 cloud 但代码配置 `toy52-cdp` 是 needsLocalCdp，loadSources 过滤后 selectRequestedSources 判 missing → 整轮 500。修复：coverageRepair 模式下 missing 源改为告警跳过（commit `4f78b6c`），该源 method 已改 manual。修复后手动触发一轮：处理 24 源、抓 357 条、入库 182 条。
2. **overdue 纳入 LLM 修复**（commit `0088675`+`1f0e7e0`）：`source-llm-repair` 路由新增候选——启用中且连续 3 天无成功抓取的云端源（排除本地CDP/登录/随手收）。逾期候选先用现有配置确定性重测，通过则 `self_healed` 不烧 LLM；失败才走 LLM 诊断。

**2026-08-23 dryRun 实测**：信息时报、中国经济网两个逾期源 self_healed 自愈（各 10 条）；另发现 LLM 调用 bug——`kimi-for-coding` 端点只允许 temperature=1，已改省略 temperature（commit `75f52208`）。**Kimi(moonshot) 备份账号余额不足被暂停，需充值。**

### 2.7 【收尾】更新交接文档
部署完成 + 验收后，更新 `a.服务器配置文件/云服务器配置文档.md`：
- 当前 release → 新 release（`20260820-xxxxxx`）
- 新增已知事项：信息源 LLM 修复系统、知识库、爱范儿/Vinyl Pulse 修复、overdue 处理
- SSH 阻塞 + 网段白名单的处理记录

### 2.8 【2026-08-23 追加】本地 CDP 源云端化评估 + Artnet 专项修复

**15 个本地 CDP 源服务器端实测结论**：
- ✅ 云端化成功 4 个：AWN（官方 RSS 30 条）、KidScreen（官方 RSS 10 条）、Kidscreen Consumer（栏目页静态 HTML 10 条）、Artnet News（Google News RSS 100 条）
- ❌ 保留本地 CDP 11 个：artnet-web/polygon/toy52 被 Cloudflare 拦服务器 IP；crunchyroll/toybook/ctoy×6 为 JS 渲染空壳

**Artnet 专项**（commit `19ec4bc`）：官网/官方 feed/jina 代理全被 Cloudflare 按服务器 IP 拦（403 挑战页），最终走 Google News RSS（`site:news.artnet.com`，licenseglobal 同款先例）。DB method 已转 cloud + is_rss=true，本地 CDP 条目已移除。

**LLM 调用坑**（commit `75f52208`）：`kimi-for-coding` 端点只允许 temperature=1，修复方式=请求体省略 temperature。另发现 Kimi(moonshot) 备份账号余额不足被 suspended，需充值才能恢复备份链路。

**2026-08-23 部署时间线**：release `20260823-200833`（云端化 3 源）→ `20260823-204012`（artnet）→ `20260823-205154`（LLM 定时器）→ `20260823-210601`（coverage-repair 500 修复）→ `20260823-211855`（overdue 纳入修复）→ 最终（temperature 修复）。

---

## 3. 用户所有要求清单（核对用）

| # | 用户要求 | 状态 |
|---|---|---|
| 1 | 排查爱范儿、Vinyl Pulse 两个信息源，给可执行修复 | ✅ 已完成（代码+知识库） |
| 2 | 评估"信息源修复知识库 + 自动监测 + 云端 LLM 自动修复、不需本机开机"的可行性 | ✅ 已完成（给出架构） |
| 3 | 先搭知识库文档模板 + LLM 修复 API 骨架 | ✅ 已完成（`docs/source-fix-kb/` + `lib/source-llm-repair.ts` + API） |
| 4 | 本地实测 | ✅ 已完成（两源根因定位 + sanitize 修复 + 网页改 web） |
| 5 | 直接部署到腾讯云 + 保存 GitHub | ✅ 已完成（2026-08-23 多轮部署上线） |
| 6 | 部署后开始跑（云端验证 LLM 链路） | ✅ 已完成（dryRun 实测，self_healed/applied 链路通） |
| 7 | 回答"逾期/未抓取源"问题，是否归纳为一种错误 | ✅ 已完成（2026-08-23，见 2.6） |
| 8 | 本地 CDP 源全部评估云端化并跑通 | ✅ 已完成（2026-08-23：4 源云端化，11 源确认保留本地 CDP） |

---

## 4. 关键路径/文件速查

- 本地代码目录：`D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码`
- 一键开门脚本：`D:\claudecode\.claude\scripts\ip-hot-ssh-open.py`（每次部署前必跑；**需改网段**）
- 部署 SOP：`a.服务器配置文件/腾讯云部署SSH-SOP.md`
- 交接基线：`a.服务器配置文件/云服务器配置文档.md`
- 知识库：`docs/source-fix-kb/`
- LLM 修复核心：`lib/source-llm-repair.ts`
- LLM 修复 API：`app/api/cron/source-llm-repair/route.ts`
- 现有确定性修复：`lib/source-repair.ts`、`app/api/cron/source-repair/route.ts`
- 服务器：腾讯云轻量 `laojia-ip`，`lhins-rg5mnq5d`，公网 `101.32.211.198`，香港一区

---

## 5. 踩坑记录（务必看）

### 5.1 本地 build 前必须移走 junction
`public/ipbrand/images` 是指向 `d:\claudecode\[2]工作项目\IP365X数据库\images` 的 **junction**。Turbopack 构建期拒绝"项目根外"的符号链接，会报 `Symlink ... points out of the filesystem root` 导致 build 失败。

**解法**（build 前/后各执行一次）：
```powershell
# build 前：删 junction + 建空目录
$p = "D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码"
$img = Join-Path $p "public\ipbrand\images"
cmd /c rmdir "`"$img`""          # 删 junction（不删目标）
New-Item -ItemType Directory -Path $img -Force | Out-Null
# ... 跑 npm run build ...
# build 后：删空目录 + 重建 junction
cmd /c rmdir "`"$img`""
cmd /c mklink /J "`"$img`"" "`"d:\claudecode\[2]工作项目\IP365X数据库\images`""
```
> **千万别用 `Move-Item`** 移 junction（会复制 2.7GB 且超时）。用 `cmd /c rmdir` 只删链接本身。

### 5.2 codeload 包需重打包（部署时）
codeload 下载的 tar.gz 带顶层套壳目录 `ip-hot-<sha>/`，必须 `--strip-components=1` 解包后重新 tar，否则 install-release 因嵌套目录失败（见 2.2 步骤 4）。

### 5.3 install-release 会覆盖 Nginx 配置
`ops/scripts/install-release` 第 47 行会把仓库 `ops/nginx/ip-hot.conf` 覆盖到服务器 `/etc/nginx/conf.d/ip-hot.conf`。**改域名/Nginx 必须同步更新仓库该文件**，否则下次部署会覆盖服务器配置导致 `www.laojia-ip.com` 证书不匹配（`ERR_CERT_COMMON_NAME_INVALID`）。已修好仓库文件（`59fc4c7`），本次部署不会回归，但要记住这条红线。

### 5.4 SSH 动态 IP / 运营商 NAT
本机出口 IP 不稳定（CGN），多个 egress IP。当前阻塞点。方案 A = 白名单 `120.240.178.0/24` 网段。open 脚本已能识别/保留网段规则，但**只添加 `/32`**，需改。

---

## 6. 服务器相关（供部署用）

- 健康检查：`/usr/local/sbin/ip-hot-health-check`（期望四项 200）
- LLM key：服务器 `/srv/apps/ip-hot/shared/.env.production.local`（有完整 `LLM_BASE_URL`/`LLM_BACKUP_URL`/`LLM_BACKUP2_URL`，本机 `.env.local` 缺失）
- 现有定时器：7 个 `ip-hot-*` timer 正常
- 已知待处理（非阻塞）：`ip-hot-coverage-repair` 持续失败（源「推特-52TOYS官方」配置与状态不一致）、`we-rss.service` failed 但容器在跑

---

## 7. 建议的下一步执行顺序（claudecode）

1. **修 open 脚本加网段**（`120.240.178.0/24`），跑开门，确认 SSH 连通。
2. SSH 连上后，按 SOP 部署 `2e74efdd`（c6401b6）到服务器。
3. 服务器健康检查 200。
4. 落地爱范儿/Vinyl Pulse DB 配置并重新启用、验收。
5. 跑 `source-llm-repair?dryRun=1` 验证 LLM 链路。
6. 接入 LLM 修复定时器。
7. 回答 overdue 问题并落地"overdue 纳入修复"。
8. 更新交接文档。
