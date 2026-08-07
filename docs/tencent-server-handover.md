# IP-HOT 腾讯云服务器交接文档（架构基线更新至 2026-08-01；SSH 安全状态更新至 2026-08-01）

> 用途：以后新开 Codex 对话时，把本文件整体发给 Codex，作为当前服务器、代码、数据库和部署流程的基线。
>
> 核验时间：2026-08-01 11:40 左右（Asia/Shanghai）。文章数、日志、备份、证书剩余天数和资源占用会随运行变化。
>
> 安全要求：本文件故意不包含任何密码、API Key、数据库口令、CRON Secret、GitHub Token 或 SSH 私钥。不要在新对话中补贴这些明文；需要时让 Codex通过现有 SSH 权限在服务器内安全读取或更新。
>
> 所有针对代码的更新，必须严格按照这个工作流程SOP执行：1）在本地文件夹（路径：D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码）里本地优化或修复，然后生成本地临时可完全预览的页面，并给出本地端口地址链接。2）等待用户确认更改无误后，再上传部署到腾讯云服务器，3）同步更新到github作为备份文件。

## 0. 2026-08-01 SSH 链路诊断、加固与防火墙现状

本次通过本地 SSH 密钥链路完成核验，**第 1–17 节的部署架构、版本、数据库行数、备份和证书均已重新采集**（2026-08-01 11:00–11:40，Asia/Shanghai）。

- 实例：`laojia-ip`，实例 ID `lhins-rg5mnq5d`，中国香港一区，公网 IPv4 `101.32.211.198`，状态为运行中。
- 现象仍是偶发 `kex_exchange_identification: read: Connection reset`（banner 前重置），连续重试可成功；服务器 uptime 9 天以上，负载正常。
- 服务器 `journalctl -u sshd` 确认：成功登录来源全部为 `120.240.178.240` 与 `120.240.178.176`，均在防火墙放行的 `120.240.178.0/24` 内；被重置的预认证连接来源同样是 `120.240.178.176`。结论：**不是防火墙来源拒绝，而是预认证握手阶段被中间路径/本地网络重置**，与 7-28 记录的现象同源。
- 防火墙已删除 `::/0 TCP 22`（IPv6 全网开放 SSH）规则；保留 IPv4 `120.240.178.0/24`、`14.153.129.193/32`、`14.154.201.79/32` 三条 22/tcp 来源规则（后两条为历史 Codex 出口）。HTTP 80、HTTPS 443 维持公网开放；8888 宝塔面板、21 FTP、8001 WeRSS 仍为全网开放，需另行规划收紧。
- `/etc/ssh/sshd_config.d/10-ip-hot-key-only.conf` 现为：`PasswordAuthentication no`、`KbdInteractiveAuthentication no`、`PermitRootLogin prohibit-password`、`MaxStartups 50:30:100`，并新增 `ClientAliveInterval 30`、`ClientAliveCountMax 3`、`TCPKeepAlive yes`；已 `sshd -t` 验证并重启 `sshd`，原配置备份为 `10-ip-hot-key-only.conf.bak-20260801-113718`。root 的现有 SSH RSA 密钥认证正常。
- 本地 `~/.ssh/config` 已新增 `101.32.211.198` 条目：`ServerAliveInterval 30`、`ServerAliveCountMax 3`、`TCPKeepAlive yes`、`ControlMaster auto`、`ControlPath ~/.ssh/cm-%r@%h:%p`、`ControlPersist 10m`。后续 ssh/scp/rsync 会复用同一条连接，避免反复握手被重置。
- 注意：Codex 本地沙箱对带变量/循环的 ssh 命令会显示 `Permission denied`，这是本地命令拦截，不是服务器问题；部署类命令需要提权执行或使用字面量命令。
- 腾讯云网页终端（OrcaTerm/TAT）仍可作为救援入口；排查时优先执行 `journalctl -u sshd -n 100 --no-pager`、`ss -ntp '( sport = :22 )'` 和 `systemctl status sshd --no-pager`。

### 0.1 本次 SSH 事件说明与恢复 SOP

这次不是腾讯云安全组直接拒绝，而是 SSH 曾向全网开放；日志中出现了未知 IP 的无效用户名、root 密码失败和异常密钥交换。它属于互联网中常见的 **SSH 扫描/密码爆破尝试**，目前没有证据表明是针对 IP-HOT 的定向入侵，也不能仅凭此认定为 DDoS。攻击连接停留在认证前阶段时会消耗 `sshd` 的预认证连接名额；原来的 `MaxStartups 10:30:100` 会在连接拥挤时概率性丢弃新连接，所以管理员会看到 `kex_exchange_identification`、`banner exchange` 或连接超时。这可以解释历史上偶发的“SSH 无法连接”。

以后出现同类问题，按以下顺序处理；整个过程不需要重启网站、Nginx、PostgreSQL 或服务器：

1. 先在腾讯云控制台进入 **轻量应用服务器 → laojia-ip → 登录**，使用 OrcaTerm/TAT 网页终端作为救援通道。不要反复从本地连续重试 SSH，以免增加预认证连接压力。
2. 在网页终端只读检查：

   ```bash
   systemctl status sshd --no-pager
   journalctl -u sshd -n 100 --no-pager
   ss -ntp '( sport = :22 )'
   /usr/sbin/sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|maxstartups|clientaliveinterval|clientalivecountmax|tcpkeepalive) '
   ```

3. 若 `sshd` 未运行、日志显示大量预认证异常，或正常 SSH 在 banner 前被重置，执行：

   ```bash
   /usr/sbin/sshd -t && systemctl restart sshd
   ```

   `sshd -t` 必须先通过；只重启 SSH，不要重启整台服务器。
4. 在实例详情的 **防火墙** 页面确认 `22/tcp` 的 IPv4 来源仅为当前管理网段 `120.240.178.0/24`；绝不能为了“先连上”把它改回“全部 IPv4 地址”。当前管理出口 IP 可在本地用以下命令确认：

   ```powershell
   nslookup -type=txt o-o.myaddr.l.google.com ns1.google.com
   ```

   若出口 IP 已不在该网段，仍通过网页终端把规则改为新的单 IP `/32` 或经确认的管理网段；改完立即测试密钥 SSH。
5. 保持 `/etc/ssh/sshd_config.d/10-ip-hot-key-only.conf` 的关键设置：禁用密码认证和交互式认证、root 仅允许密钥认证、`MaxStartups 50:30:100`，以及 `ClientAliveInterval 30`、`ClientAliveCountMax 3`、`TCPKeepAlive yes`。修改后始终先执行 `sshd -t`，再 `systemctl restart sshd`。
6. 从本地验证：

   ```powershell
   ssh -o BatchMode=yes -o ConnectTimeout=15 root@101.32.211.198 "hostname; systemctl is-active sshd"
   ```

   成功应返回主机名 `VM-0-9-opencloudos` 和 `active`。随后再检查 `journalctl -u sshd -n 30 --no-pager`，确认只有受信任来源的密钥登录。

7. 若改错规则而本地被锁在外面，不要扩大公网开放范围；继续使用腾讯云网页终端，修正防火墙来源或 SSH 配置后再测。网页终端是此实例的应急恢复入口。

## 1. 当前结论

- 正式站点：`https://hot.laojia-ip.com/`
- RSS 公众号订阅子站：`https://rss.laojia-ip.com/`（we-rss + rsshub，Docker）
- 腾讯云公网 IPv4：`101.32.211.198`
- DNS：`hot.laojia-ip.com` 的 A 记录直接指向 `101.32.211.198`，Cloudflare 为“仅 DNS/灰云”，当前没有 Cloudflare CDN/WAF 代理。
- 正式架构：`Next.js + 本机 PostgreSQL + Nginx + systemd + Certbot`。
- IP-HOT 主站不使用 Docker、Vercel 托管、Supabase 运行时或 PM2 托管应用；服务器上的 Docker 仅承载 rss 子站（we-mp-rss + rsshub）。
- GitHub 只做源代码备份；不会触发正式站部署。
- 正式应用运行在 `127.0.0.1:3101`，PostgreSQL 运行在 `127.0.0.1/[::1]:5432`，二者不直接暴露公网。
- 当前正式 release：`20260801-001349`，由已提交的 `40980bf`（`fix: RSS Accept头改为*/*，修复licensingsource 403`）归档部署。
- 本轮实时检查：主页、来源 API、站点页面 API、管理员监控 API 均为 HTTP 200；证书文件可正常读取。

## 2. 总体架构

```text
浏览器
  |
  | HTTPS 443（HTTP 80 自动 301 跳转）
  v
Cloudflare DNS-only
  |
  v
101.32.211.198
  |
  v
Nginx 1.26.3
  |
  | reverse proxy / keepalive
  v
Next.js 16.2.11 + React 19.2.4
systemd: ip-hot.service
127.0.0.1:3101
  |
  +--> PostgreSQL 16.12 / 数据库 ip_hot / 127.0.0.1:5432
  |
  +--> RSS、网页抓取等外部来源
  |
  +--> DeepSeek -> Kimi -> Kimi Coding（按顺序故障切换）

rss.laojia-ip.com（公众号订阅子站，Docker）
  | HTTPS 443
  v
Nginx -> 127.0.0.1:8001 we-mp-rss（公网 0.0.0.0:8001）
  +--> 127.0.0.1:1200 rsshub（仅本机）

systemd timers
  +--> 每 20 分钟调用抓取处理 API
  +--> 每 3 分钟调用 LLM 队列 API
  +--> 每 3 分钟处理待分类文章
  +--> 每 30 分钟修复错过的云来源抓取（coverage-repair）
  +--> 每 5 分钟做健康检查
  +--> 每天备份 PostgreSQL
```

## 3. 腾讯云主机信息

| 项目 | 当前值 |
|---|---|
| 主机名 | `VM-0-9-opencloudos` |
| 云厂商/虚拟化 | Tencent Cloud / KVM；系统报告 Hardware Model 为 CVM |
| 操作系统 | OpenCloudOS 9.6 x86_64 |
| 内核 | Linux `6.6.119-49.23.oc9.x86_64` |
| CPU | 2 vCPU |
| 内存 | 3.6 GiB 可见内存；另有 1.0 GiB Swap |
| 磁盘 | 单个 70 GB XFS 根分区 `/dev/vda1`，不需要重新分区 |
| 核验时磁盘使用 | 53 GB / 70 GB，约 76%，剩余约 18 GB |
| SELinux | Disabled |
| firewalld | inactive；实际公网保护依赖腾讯云安全组 |
| 时区/定时表达 | systemd 输出为 CST，即 Asia/Shanghai 使用习惯 |

资源规划仍采用“目录隔离”，而不是磁盘分区：

- 系统、软件和面板：预算 12 GB
- 应用 release 和构建依赖：预算 10 GB
- PostgreSQL：预算 25 GB
- 数据库备份：预算 15 GB
- 日志、临时文件和余量：预算 8 GB
- 建议磁盘 70% 告警，80% 必须处理。

## 4. 软件与语言版本

正式应用实际使用：

- `/usr/bin/node`（正式 systemd 服务实际使用）：Node.js `v20.20.0`（符号链接指向 node-20），npm `10.8.2`
- `/root/.nvm/versions/node/v22.23.1/bin/node`：Node.js `v22.23.1`（nvm 安装，npm `10.9.8`），root shell 经 nvm 初始化后使用
- Next.js：`16.2.11`
- React / React DOM：`19.2.4`
- TypeScript：`^5`
- PostgreSQL：`16.12`
- Nginx：`1.26.3`
- Certbot：`2.8.0`

正式 systemd 服务 ExecStart 使用 `/usr/bin/node`（当前为 node-20 `v20.20.0`），root shell 经 nvm 后是 `v22.23.1`。**不要凭历史记录假设 `/usr/bin/node` 是 v22**，以 `node -v` 和 systemd 进程实际路径为准；升级 Node 前需先验证 Next.js 构建与健康检查。

项目主要语言/文件类型：

- TypeScript / TSX：Next.js 页面、React 组件、API Route、业务逻辑。
- JavaScript `.mjs`：抓取、批处理、GitHub API 推送和运维辅助脚本。
- SQL：PostgreSQL schema、历史迁移脚本。
- Bash：服务器初始化、release 安装、健康检查、数据库备份。
- Python：少量旧的抓取脚本；不是当前常驻服务。
- CSS / Tailwind CSS 4：页面样式。
- Nginx 配置、systemd unit/timer、YAML GitHub workflow。

主要 npm 运行依赖：

- `next ^16.2.11`
- `react 19.2.4`
- `react-dom 19.2.4`
- `pg ^8.16.3`
- `cheerio ^1.1.2`
- `rss-parser ^3.13.0`

## 5. 网络端口和访问边界

当前服务器监听：

| 端口 | 绑定 | 用途 | 是否应公网开放 |
|---|---|---|---|
| 22/tcp | `0.0.0.0`、`[::]` | SSH | 是；防火墙仅放行 `120.240.178.0/24`、`14.153.129.193/32`、`14.154.201.79/32`（IPv6 全网规则已删） |
| 80/tcp | `0.0.0.0`、`[::]` | HTTP 跳转和 ACME 验证 | 是 |
| 443/tcp | `0.0.0.0`、`[::]` | HTTPS | 是 |
| 8888/tcp | `*` | 宝塔面板 | 只允许管理员 IP/VPN，禁止全网开放 |
| 3101/tcp | `127.0.0.1` | Next.js | 否 |
| 5432/tcp | `127.0.0.1`、`[::1]` | PostgreSQL | 否 |
| 8001/tcp | `0.0.0.0`、`[::]` | we-mp-rss（rss 子站，Docker） | 当前公网开放（WeRSS 公众号订阅） |
| 1200/tcp | `127.0.0.1` | rsshub（Docker） | 否 |
| 25/tcp | loopback | 本机邮件服务 | 否 |

当前从本机解析域名得到 `101.32.211.198`。腾讯云防火墙的具体规则以控制台为准；2026-08-01 导出的规则见用户桌面 `firewallRules_2026-08-01 11_30_26.csv`。

## 6. 服务器目录和全部关键文件

### 6.1 IP-HOT 应用目录

```text
/srv/apps/ip-hot/
├─ current -> /srv/apps/ip-hot/releases/20260801-001349
├─ releases/                  # 当前共 62 个 release
│  ├─ ...
│  └─ 20260801-001349        # 当前正式 release，对应 40980bf 归档
└─ shared/
   ├─ .env.production.local  # 正式环境变量和密钥，0600，iphot:iphot
   ├─ .env.production.local.before-5f99e46 # 历史备份，0600
   ├─ curl-auth.conf          # systemd curl 的 Bearer 头，0600
   └─ migration-data/        # 从 Supabase 一次性迁移留下的 JSON；日常部署不使用
```

`migration-data/` 内有：

- `articles.json`
- `changelogs.json`
- `classification_learnings.json`
- `cron_logs.json`
- `daily_reports.json`
- `info_sources.json`
- `pipeline_state.json`
- `source_fetch_runs.json`
- `summary.json`

当前 releases 总占用约 40 GB；正常完整 release 每个约 600–1000 MB，因为包含 `node_modules` 和 `.next`。安装脚本目前不会自动清理旧 release，磁盘已到 76%，**需要尽快规划清理**：保留当前及最近 1–2 个、再安全清理更旧版本，但不要在未确认 `current` 链接目标前删除。

### 6.2 系统级 IP-HOT 配置

```text
/etc/nginx/conf.d/ip-hot.conf
/etc/logrotate.d/ip-hot

/etc/systemd/system/ip-hot.service
/etc/systemd/system/ip-hot-fetch.service
/etc/systemd/system/ip-hot-fetch.timer
/etc/systemd/system/ip-hot-llm.service
/etc/systemd/system/ip-hot-llm.timer
/etc/systemd/system/ip-hot-pending-classification.service
/etc/systemd/system/ip-hot-pending-classification.timer
/etc/systemd/system/ip-hot-health.service
/etc/systemd/system/ip-hot-health.timer
/etc/systemd/system/ip-hot-coverage-repair.service
/etc/systemd/system/ip-hot-coverage-repair.timer
/etc/systemd/system/ip-hot-source-repair.service
/etc/systemd/system/ip-hot-source-repair.timer
/etc/systemd/system/ip-hot-backup.service
/etc/systemd/system/ip-hot-backup.timer
/etc/systemd/system/we-rss.service        # we-rss Docker Compose 常驻

/usr/local/sbin/ip-hot-health-check
/usr/local/sbin/ip-hot-backup

/etc/nginx/conf.d/we-rss.conf             # rss.laojia-ip.com 反代到 127.0.0.1:8001

/etc/letsencrypt/live/hot.laojia-ip.com/fullchain.pem
/etc/letsencrypt/live/hot.laojia-ip.com/privkey.pem
/etc/letsencrypt/live/rss.laojia-ip.com/fullchain.pem
/etc/letsencrypt/live/rss.laojia-ip.com/privkey.pem
/etc/letsencrypt/options-ssl-nginx.conf
/etc/letsencrypt/ssl-dhparams.pem

/var/log/ip-hot/app.log
/var/log/ip-hot/error.log

/srv/backups/postgresql/ip_hot-*.dump
/var/lib/pgsql/data/             # PostgreSQL 数据目录
/srv/apps/we-rss/                # we-rss Docker Compose 目录（we-rss.service 用 docker compose up -d）
```

### 6.3 root 下的部署/迁移存档

关键名称如下，均不要公开内容：

- `/root/.ip-hot-db-password`：数据库应用账号口令，0600。
- `/root/.ip-hot-cron-secret`：内部定时任务密钥，0600。
- `/root/ip-hot-migration-data.tar.gz`：一次性迁移数据包。
- `/root/ip-hot-release-40980bf.tar.gz`：当前正式 release（`20260801-001349`）的归档包。
- `/root/ip-hot-release-b63b156.tar.gz`：上一版（`20260726-012556`）归档包。
- `/root/ip-hot-release-1eea687.tar.gz`、`/root/ip-hot-release-980db00.tar.gz` 等：近期历史归档包。
- `/root/ip-hot-release.tar.gz`：早期通用 release 包。
- `/root/ip-hot.service`、`ip-hot-fetch.service`、`ip-hot-llm.service`、`ip-hot-health-check`：早期安装中转文件；正式使用的是 `/etc/systemd/system` 和 `/usr/local/sbin` 中的版本。

### 6.4 为以后其他项目预留的目录

- `/srv/jobs/`：以后独立定时脚本；当前为空。
- `/srv/www/`：以后静态 HTML 小工具；当前为空。
- 新 Next.js/API 应用应使用独立 Linux 用户、独立 PostgreSQL 数据库和独立 loopback 端口，例如 3102、3103。
- 静态工具不必启 Node，可由 Nginx 直接指向 `/srv/www/<工具名>/public/`。

## 7. 本地代码仓库和当前版本

唯一应编辑的本地源代码目录：

```text
D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码
```

不要在 Desktop、临时目录、服务器当前 release 内直接改正式源代码。

Git 信息：

- 分支：`main`
- 本地完整 HEAD：`40980bf818d64eb65c916b258b4a2d167a358231`
- 短 SHA：`40980bf`
- 提交：`fix: RSS Accept头改为*/*，修复licensingsource 403`
- 本轮核验时工作区干净。
- remote：`https://github.com/Franky779/ip-hot.git`
- GitHub 仓库：`Franky779/ip-hot`
- 服务器 current 指向 `20260801-001349`，且 `/root/ip-hot-release-40980bf.tar.gz` 存在；正式 release 来自本地 `40980bf` 的归档。
- 本轮未重新验证远端 GitHub 备份提交 SHA；如需确认，使用已授权环境执行 `_push_via_api.mjs` 或查询 GitHub API，勿将 Token 写入文档或仓库。

### 7.1 源码目录作用

```text
app/
  page.tsx、layout.tsx、loading.tsx、globals.css
  components/                 # 首页搜索、分类、时间线、管理操作、主题等组件
  sources/                    # 信息源管理页面与组件
  monitor/                    # 来源质量监控页面与组件
  api/admin/                  # 管理认证、文章修改/删除、监控、来源操作、LLM 等 API
  api/cron/                   # fetch-and-process、fetch-rss、process-llm
  api/sources/                # 公共来源 API

lib/
  admin-auth.ts               # 管理员鉴权
  supabase.ts                 # 文件名为兼容旧代码保留；实际是 pg 直连 PostgreSQL 的适配层
  llm.ts                      # 三个 LLM 的顺序、重试、分类和摘要
  rss.ts、scraper.ts          # RSS/网页抓取
  sources.ts、source-*.ts     # 信息源、调度、质量、覆盖率
  relevance.ts               # 行业相关性规则
  classification-learning.ts # 分类学习
  link-checker.ts             # 链接检查
  filtered-pagination.ts      # 过滤分页
  *.test.ts                   # 质量与分页测试

ops/
  nginx/                      # HTTP 初装配置与正式 HTTPS 配置
  systemd/                    # 1 个常驻 service、6 个 oneshot service、6 个 timer（含 coverage-repair）
  scripts/                    # bootstrap、install-release、health-check、backup
  postgres/schema.sql         # PostgreSQL schema
  migration/                  # 一次性 Supabase 导出和 PostgreSQL 导入工具
  logrotate/ip-hot            # 日志轮转

scripts/
  # 抓取、调试、来源测试、LLM worker、批处理及部署文件测试工具。
  # Windows .bat、Python 和部分旧脚本不等于服务器当前常驻任务。

public/                       # 静态文件；仍有旧名称 vercel.svg，仅是素材，不表示在用 Vercel
.github/workflows/            # 目前只有手动 workflow_dispatch，不自动定时部署
docs/                         # 调试 SOP、来源质量说明、旧版服务器布局说明
```

根目录中仍有若干 `supabase-*.sql`、`setup-db.sql` 和 `.env.local` 中的旧 Supabase 配置。这些是迁移历史/本地旧配置，不代表正式服务器仍依赖 Supabase。正式服务器环境变量中没有任何 `SUPABASE_*`。

## 8. Nginx 和 HTTPS

Nginx 配置文件：`/etc/nginx/conf.d/ip-hot.conf`。

当前行为：

- HTTP 80 自动 `301` 到 HTTPS。
- HTTPS 443 启用 HTTP/2，ALPN 实测为 `h2`。
- 反向代理到 upstream `127.0.0.1:3101`，keepalive 32。
- gzip 开启，压缩级别 5。
- `/_next/static/` 缓存一年，`Cache-Control: public, max-age=31536000, immutable`。
- `/api/` 按 IP 限速 30 请求/秒，burst 60。
- API 和页面的代理读写超时为 330 秒，适配抓取/LLM 长请求。
- 请求体上限 10 MB。
- 已隐藏 HTTPS 响应中的 Nginx版本和 `X-Powered-By`；Next.js `poweredByHeader: false`。
- 安全头：HSTS 一年、`nosniff`、`SAMEORIGIN`、严格来源策略、禁摄像头/麦克风/定位。
- 动态首页目前返回 `private, no-cache, no-store`，这是当前 Next.js 动态渲染策略。
- 另有 `/etc/nginx/conf.d/we-rss.conf`：`rss.laojia-ip.com` 反代到 `127.0.0.1:8001`（we-mp-rss，Docker），HTTP 80 自动 301 到 HTTPS，证书由 Certbot 管理；`/assets/` 走长缓存。

证书：

- 域名：`hot.laojia-ip.com`
- Let’s Encrypt ECDSA
- 核验时到期：`2026-10-21 12:02:58 UTC`
- 另有 `rss.laojia-ip.com`（rss 子站）：Let’s Encrypt ECDSA，核验时到期 `2026-10-21 13:37:08 UTC`
- `certbot-renew.timer` 已启用，自动续期。
- 核验时 `nginx -t` 通过，证书 Verify return code 为 0。

## 9. systemd 服务和定时任务

### 9.1 常驻应用

`ip-hot.service`：

- 状态：enabled、active/running。
- 用户/组：`iphot:iphot`，UID/GID 992。
- 工作目录：`/srv/apps/ip-hot/current`。
- 启动命令：`/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3101`。
- 自动重启：`Restart=always`，间隔 5 秒。
- 内存上限：1 GB。
- 文件句柄上限：65535。
- 日志写到 `/var/log/ip-hot/app.log` 和 `error.log`。
- 核验时 PID 995252、Next.js v16.2.11、systemd cgroup 内存约 113 MB、重启次数 0；启动时间 2026-08-01 00:14:47 CST。

### 9.2 定时器

| Timer | 周期 | 调用/作用 | 当前状态 |
|---|---|---|---|
| `ip-hot-fetch.timer` | 每 20 分钟，随机延迟最多 30 秒 | 内网调用 `/api/cron/fetch-and-process` | enabled，最近一次 success/0 |
| `ip-hot-llm.timer` | 每 3 分钟，随机延迟最多 20 秒 | 内网调用 `/api/cron/process-llm` | enabled，最近一次 success/0 |
| `ip-hot-pending-classification.timer` | 每 3 分钟，随机延迟最多 20 秒 | 内网调用 `/api/admin/process-pending-classification` | enabled，最近一次 success/0 |
| `ip-hot-health.timer` | 每 5 分钟，随机延迟最多 30 秒 | 检查主页、来源 API、站点页面 API、管理员监控 API | enabled，最近一次 success/0 |
| `ip-hot-coverage-repair.timer` | 每 30 分钟（每小时 :10/:30，随机延迟最多 45 秒） | 内网调用 `/api/cron/fetch-and-process?coverageRepair=1`，补抓错过的云来源 | enabled，最近一次 success/0 |
| `ip-hot-source-repair.timer` | 每小时（:45，随机延迟最多 60 秒） | 内网调用 `/api/cron/source-repair`，测试因失败停用的信息源，通过则自动重新启用并同步代码配置 | enabled，随 install-release 启用 |
| `ip-hot-backup.timer` | 每天 03:20，随机延迟最多 10 分钟 | `pg_dump` 自定义格式并保留 7 天 | enabled；下一个计划周期执行 |

这些 oneshot 服务执行完成后显示 `inactive` 是正常现象，应看 `Result=success` 和 `ExecMainStatus=0`，不要把 inactive 误判为故障。`ip-hot-coverage-repair.service` 通过 `curl --config /srv/apps/ip-hot/shared/curl-auth.conf` 携带认证头调用。

另有 `we-rss.service`（oneshot + `RemainAfterExit=yes`，WorkingDirectory=`/srv/apps/we-rss`）：`docker compose up -d` 启动 we-mp-rss（端口 8001）和 rsshub（127.0.0.1:1200），enabled。

`/etc/logrotate.d/ip-hot` 每天轮转日志，保留 14 份，压缩并 copytruncate。

## 10. PostgreSQL

- 服务：`postgresql.service`，enabled、active/running。
- 版本：16.12。
- 数据库：`ip_hot`。
- 应用角色：`ip_hot_app`，可登录，但不是 superuser、不能建库、不能建角色。
- `listen_addresses=localhost`，端口 5432，max_connections 100。
- 应用连接池：`DATABASE_POOL_SIZE=10`。
- 数据目录：`/var/lib/pgsql/data/`，核验时约 106 MB。
- 数据库逻辑大小：核验时约 42 MB。

实时表和当时行数：

| 表 | 行数 |
|---|---:|
| `articles` | 14693 |
| `info_sources` | 211 |
| `cron_logs` | 10582 |
| `source_fetch_runs` | 15393 |
| `classification_learnings` | 73 |
| `changelogs` | 3 |
| `pipeline_state` | 1 |
| `daily_reports` | 0 |

文章、抓取记录和日志会被定时任务持续更新，以上行数只是核验快照。`info_sources` 较上次下降（229→211），与近期删除失效/被 Cloudflare 拦截的海外源有关；最近一次抓取运行 `totalActiveSources=209`。

初次迁移时，Supabase 导出 `pipeline_state` 和 `daily_reports` 曾因 403 无权读取；本机 PostgreSQL 对应表按新 schema 建立，`pipeline_state` 使用默认状态、`daily_reports` 为空。其他核心数据已导入。

## 11. 数据库备份和恢复边界

- 目录：`/srv/backups/postgresql/`
- 格式：`pg_dump --format=custom`
- 本地保留：7 天。
- 核验时共有 12 个备份，总计约 56 MB。
- 最新：`ip_hot-20260801-032724.dump`，大小 6,813,753 字节。
- 另有部署前手动备份 `ip_hot-before-ab0ab1e-20260728-122631.dump`（脚本按 `mtime +7` 清理时不受影响）。
- 历史核验曾用 `pg_restore --list` 验证备份可列出 58 行目录信息（本轮未重跑，属历史记录）。
- GitHub 只备份代码，不备份数据库。
- 当前尚没有 COS/异机备份；如果服务器磁盘整体损坏，本机备份也会一起丢失。以后应单独规划每周加密异地备份。
- 日常 release 部署绝不自动导入迁移数据；数据库恢复/导入必须是单独、明确、先备份的操作。

## 12. 正式环境变量与 LLM

正式环境文件：`/srv/apps/ip-hot/shared/.env.production.local`，权限 0600，属主 `iphot:iphot`。release 中的 `.env.production.local` 是指向该共享文件的链接。

变量名包括：

```text
ADMIN_PASSWORD
DATABASE_URL
DATABASE_POOL_SIZE
CRON_SECRET
LLM_WORKER_SECRET
LLM_BASE_URL
LLM_API_KEY
LLM_MODEL
LLM_BACKUP_URL
LLM_BACKUP_KEY
LLM_BACKUP_MODEL
LLM_BACKUP2_URL
LLM_BACKUP2_KEY
LLM_BACKUP2_MODEL
LLM_BACKUP2_PROTOCOL
```

不要打印这些变量的值。当前 LLM 顺序：

1. DeepSeek：`https://api.deepseek.com`，模型 `deepseek-v4-flash`，最多 3 次尝试。
2. Kimi：`https://api.moonshot.cn/v1`，模型 `kimi-k2.6`，最多 2 次尝试。
3. Kimi Coding：`https://api.kimi.com/coding/v1`，模型 `kimi-for-coding`，OpenAI 兼容协议，最多 2 次尝试。

最后一次迁移验收时主 DeepSeek 工作正常，LLM 定时任务也成功处理队列。Kimi Coding 当时账号调用曾返回额度不足 403；它是第三顺位，不影响主链路，但以后实际触发备援时需要重新检查额度。

注：2026-08-01 本轮仅核验环境变量名列表与 LLM 定时任务执行成功，未重新打印或验证三个模型的具体配置值；模型顺序以上述历史记录为准，切换前应先确认额度与配置。

### 12.1 筛选基准调整与 LLM 历史资讯处理规则

- 管理员在“运营监控 → 待分类”卡片调整并确认筛选基准分后，新基准只用于此后首次进入 LLM 分类流程、尚未完成处理的新资讯。
- 已完成 LLM 处理的历史资讯不得因筛选基准调整而重新评分、重新分类或重复处理；历史资讯继续保留处理当时记录的 `selection_threshold`、评分、分类和展示结果。
- LLM 队列只领取尚未处理的资讯（当前判定条件为 `title_cn IS NULL`）。修改全局筛选基准本身不得把历史资讯重新加入 LLM 队列，也不得触发历史数据批量回算。
- 如以后确需重评历史资讯，必须作为单独的数据迁移或人工批处理任务提出，明确范围、先备份并经用户确认，不能与日常筛选基准调整联动执行。

网站管理员密码、三个 LLM Key 等曾在旧对话中以明文出现过，建议以后安排轮换，但本交接文档不重复它们。

## 13. 发布、健康检查和回滚机制

`ops/scripts/install-release` 的正式流程：

1. 在 `/srv/apps/ip-hot/releases/<时间戳>` 新建 release。
2. 解压指定的 Git commit 归档。
3. 链接 shared `.env.production.local`。
4. 以 `iphot` 用户运行 `npm ci` 和 `npm run build`。
5. 安装/更新 systemd、Nginx、logrotate、health-check、backup 文件。
6. 先执行 `nginx -t`。
7. 原子切换 `/srv/apps/ip-hot/current` 符号链接。
8. reload Nginx、restart IP-HOT。
9. 最多等待约 20 秒，反复执行健康检查。
10. 若构建、Nginx 或健康检查失败，恢复上一个 release 链接和旧 Nginx 配置，再重启旧版本。

健康脚本检查：

- `http://127.0.0.1:3101/`
- `http://127.0.0.1:3101/api/sources`
- `http://127.0.0.1:3101/api/site-pages`
- 携带管理员密码头的 `http://127.0.0.1:3101/api/admin/monitor`

本轮输出：`home=200 sources=200 site_pages=200 monitor=200`。不要将单次网络耗时作为性能基线。

## 14. 以后固定的开发与发布流程

必须保持以下顺序：

1. 只在本地唯一目录修改代码。
2. 每次只做一个明确目标；先读目标文件，先给修改计划，用户确认后再改。
3. 本地运行检查和构建。
4. 建立 SSH 数据库隧道，在本地端口 5433 访问腾讯云 PostgreSQL；本地 Next.js 通常使用 3010。
5. 给用户本地预览地址，预览阶段避免触发写数据库、批量抓取或 LLM 操作，因为隧道连接的是正式数据库。
6. 必须等待用户明确回复“预览无误”。
7. 本地创建一个清晰 Git commit。
8. 把这个确定的 commit 打包并部署到腾讯云，不能直接改服务器 `current` 目录。
9. 运行服务器内部健康检查，并访问 `https://hot.laojia-ip.com/` 做线上验收。
10. 腾讯云验收通过后，再用 `_push_via_api.mjs` 把同一文件树写到 GitHub 备份。

本地预览概念命令（密码不得写进文档或提交）：

```powershell
ssh -N -L 5433:127.0.0.1:5432 root@101.32.211.198
# 在另一个 PowerShell 为当前进程安全设置 DATABASE_URL，指向 127.0.0.1:5433
npm run dev -- -H 127.0.0.1 -p 3010
```

部署时应从 `git archive HEAD` 生成 release 包，确保部署的是已提交内容，而不是未提交工作区。当前脚本测试还会检查所有 `ops/**` 文件必须是 LF 行尾，防止 Linux 出现 `bash\r` 错误。

GitHub 推送规则：

```powershell
# GITHUB_TOKEN 只放当前进程环境变量，不写入仓库
node _push_via_api.mjs
```

- 只能使用 `_push_via_api.mjs`，不要直接 `git push`；当前网络环境 `github.com:443` 不可靠，而 `api.github.com` 可用。
- 脚本无参数时读取最新本地 commit 的消息和变更文件，并通过 GitHub Git Data API 创建 blob/tree/commit。
- 脚本支持删除文件，并使用 `git show HEAD:<path>` 上传已提交 blob，避免 Windows CRLF 或未提交内容污染备份。
- 为保证脚本只推最新 commit 时不漏文件，每次有效变更保持一个清晰 commit，并确保上一次 GitHub 备份已对齐。

建议每次发布前运行：

```powershell
npm run lint
npm run test:quality
npm run test:deployment
npm run build
```

`npm run test:source` 涉及来源行为，可按改动目标决定是否运行。上次部署前 TypeScript、质量测试、2 个部署测试和 production build 均通过。曾有一个非致命 Turbopack/NFT 动态文件路径 trace warning；另外上次审计记录为 6 个依赖漏洞（1 low、1 moderate、4 high），没有执行可能引发破坏性升级的 `npm audit fix --force`。这些属于“上次记录”，处理前应重新运行确认。

## 15. Vercel、Supabase、GitHub 的当前关系

### Vercel

- IP-HOT 已不使用 Vercel。
- 已执行 Vercel Git disconnect，GitHub push 不再创建 Vercel deployment。
- 本地没有 `.vercel/`，仓库没有 `vercel.json`。
- `hot.laojia-ip.com` DNS 已直接指向腾讯云。
- 旧 Vercel deployments 即使仍保留，也不承载当前域名流量；可留作历史，不影响正式站。

### Supabase

- 正式服务器没有 `SUPABASE_*` 环境变量。
- 运行时直接使用本机 PostgreSQL。
- `lib/supabase.ts`、根目录旧 SQL、迁移 JSON 只是兼容命名或迁移历史，不要仅凭文件名误判仍在用 Supabase。
- 不要重新引入 Supabase，除非用户明确要求改变架构。

### GitHub

- 仓库 `Franky779/ip-hot` 只做代码备份。
- `.github/workflows/frequent-fetch.yml` 现在只有 `workflow_dispatch`，不会定时自动运行。
- 正式抓取和 LLM 调度都在腾讯云 systemd timers。

## 16. 已知事项和以后排障优先级

当前不需要立即改动，但新对话排障时应知道：

1. `migration-data/` 当前历史权限仍为 0777，且只用于一次性迁移；日常运行不依赖。以后可在单独安全任务中收紧权限或归档删除。
2. firewalld 未启用；8888（宝塔）、21（FTP）、8001（WeRSS）仍监听所有地址且防火墙全网开放，必须依靠腾讯云防火墙限制。22/tcp 的 IPv6 全网规则已于 2026-08-01 删除，IPv4 仅放行管理网段与两个 Codex 出口。
3. root 下存在 PM2 空闲 daemon（`pm2 ls` 没有任何应用）；IP-HOT 只由 systemd 管理。不要同时再用 PM2 启动 IP-HOT，否则会端口冲突/重复任务。
4. `systemctl --failed` 仍只有 `ipmi.service` failed，与 IP-HOT 无关；不要把它误判为网站故障。
5. 旧 release 已积累到 62 个、约 40 GB，磁盘 53G/70G（76%），**已达到必须清理的程度**；单独规划安全清理策略，保留当前及最近 1–2 个 release。
6. 数据库只有本机备份，没有异地灾备。
7. HTTP 80 的 301 响应目前仍可能显示完整 Nginx 版本；HTTPS 已隐藏版本。这是低优先级加固项。
8. LLM、管理员、GitHub 等密钥曾在历史对话暴露，适合后续统一轮换；轮换时只更新服务器 shared env/安全存储，不提交到 Git。
9. `.env.local` 是本地旧配置且被 gitignore；正式配置以服务器 shared env 为准。
10. SSH 已加保活与本地连接复用（`~/.ssh/config` ControlMaster），但仍偶发预认证 reset；部署上传前先做一次连通测试，失败就重试，不要反复短连接刷握手。
11. 服务器新增 Docker 运行时，仅用于 rss 子站（we-mp-rss、rsshub），与 IP-HOT 主站无关；主站部署脚本不使用 Docker。

出现问题时建议按顺序检查：

```bash
systemctl status ip-hot.service --no-pager
systemctl status nginx postgresql --no-pager
/usr/local/sbin/ip-hot-health-check
systemctl list-timers --all 'ip-hot-*' --no-pager
systemctl show ip-hot-fetch.service ip-hot-llm.service ip-hot-pending-classification.service ip-hot-health.service ip-hot-coverage-repair.service -p Id -p Result -p ExecMainStatus -p ExecMainExitTimestamp
tail -n 100 /var/log/ip-hot/error.log
tail -n 100 /var/log/ip-hot/app.log
nginx -t
ss -lntup
df -hT /
free -h
```

如果是发布故障，先确认：

- 本地目标 commit 和 `git status`。
- `/srv/apps/ip-hot/current` 当前链接目标。
- 最近 release 目录及对应 release 包名。
- `npm run build` 的完整错误。
- Nginx `nginx -t`。
- 健康检查四项 HTTP 状态（home/sources/site_pages/monitor）。
- 不要为了“试一下”直接修改正式 release 或导入数据库。

## 17. 发给新 Codex 对话时的开场指令

可把本文件整体发给新对话，并在末尾追加：

> 以上是 IP-HOT 截至 2026-08-01 的腾讯云交接基线。请先用只读命令重新核验会变化的信息（当前 Git HEAD、服务器 current release、systemd 服务/timer、数据库行数、磁盘、证书和公网健康），不要输出任何密钥。所有代码修改必须只在 `D:\claudecode\[2]工作项目\[10]IP-HOT咨询聚合网站源代码` 进行；先规划并等我确认，再修改；先本地预览并等我回复“预览无误”，再部署腾讯云并线上验收，最后用 `_push_via_api.mjs` 同步 GitHub。Vercel 和 Supabase 不属于正式运行链路；rss.laojia-ip.com（we-rss/rsshub，Docker）与主站相互独立。
