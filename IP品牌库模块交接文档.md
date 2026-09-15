# IP 品牌库（/ipbrand）模块交接文档

> 版本：2026-08-19 · 对应线上 release `20260818-165425` · commit `e4893d10`
> 适用范围：hot.laojia-ip.com/ipbrand 整个板块（列表页 / 详情页 / 新增页 / 管理员后台）

---

## 0. 一句话总览

IP 品牌库是一个**给品牌方/被授权商看 IP 档案**的展示站，数据源是抓取来的 **2014 个 IP**（静态基线），管理员登录后可以**删除、编辑、新增 IP，上传图片和品牌手册**。管理员改的东西存进一个**单独的增量文件**，不碰原始 2014 条数据。

打个比方：静态基线 `ips.json` 是印好的字典，管理员增量文件是贴在书里的便利贴——字典不动，便利贴覆盖显示。改坏了，撕掉便利贴就还原。

---

## 1. 技术架构（代码规划）

### 1.1 数据模型：静态基线 + 管理员增量

**核心思想：抓取数据与人工修改分离。**

| 数据 | 文件 | 谁写 | 说明 |
|------|------|------|------|
| 静态基线 | `public/ipbrand/ips.json` | 只读（git 部署） | 2014 条 IP 全量数据，4.5MB |
| 管理员增量 | `data/ipbrand-admin.json` | 管理员操作写 | 4 个字段，见下 |
| 图片资产 | `public/ipbrand/images/`（本地） | 管理员上传 | 2.7GB，git 排除，独立部署 |
| 品牌手册 | `public/ipbrand/manuals/`（本地） | 管理员上传 | PDF 转图，仅展示 |

**增量文件 `data/ipbrand-admin.json` 的 4 个字段：**

```jsonc
{
  "deleted": [4],                                    // 被删除的 IP id 列表
  "edits": { "640": { ...字段覆盖... } },            // 每个 IP 的编辑快照（key 是 IP id）
  "manuals": { "640": [{ "name": "...", "url": "..." }] },  // 每个 IP 的品牌手册图
  "new_records": [ { ...完整 IP 记录... } ]          // 管理员新增的 IP（列表末尾追加）
}
```

前端加载时把两个来源**合并**：`ips.json` + 增量 → 过滤掉 `deleted` → 应用 `edits` 覆盖 → 追加 `new_records` → 追加手册图。合并逻辑在 `lib/ipbrand-types.ts` 的 `mergeIpRecords()`（纯函数，前后端通用）。

### 1.2 前后端目录结构

```
app/ipbrand/                        # 板块三个页面
├── page.tsx                        # 列表页服务端入口
├── IpBrandClient.tsx               # 列表页客户端（搜索/筛选/删除/新增按钮）
├── detail/
│   ├── page.tsx                    # 详情页服务端入口（读取 ?id=）
│   └── IpDetailClient.tsx          # 详情页客户端（展示 + 编辑模式）
└── new/
    ├── page.tsx                    # 新增 IP 页服务端入口
    └── IpNewClient.tsx             # 新增 IP 表单客户端

app/api/ipbrand/                    # 公开接口
└── overrides/route.ts              # GET 返回管理员增量（前端合并用）

app/api/admin/ipbrand/              # 管理员接口（全部校验 x-admin-password 头）
├── delete/route.ts                 # 删除 IP
├── save-edit/route.ts              # 保存 IP 字段编辑
├── create/route.ts                 # 新增 IP（multipart，含图）
├── upload-images/route.ts          # 批量上传展示图/案例图（只写磁盘，元数据走 save-edit）
├── upload-manual/route.ts          # 批量上传品牌手册图（立即写元数据）
└── delete-manual/route.ts          # 删除品牌手册单图

lib/
├── ipbrand-types.ts                # 共享类型 + mergeIpRecords（纯函数，无 node:fs，客户端安全）
├── ipbrand-admin.ts                # 服务端：增量读写 + 上传目录 + 文件命名（node:fs，仅服务端）
└── admin-auth.ts                   # 管理员认证工具（校验密码 / CronSecret）

app/components/AdminToggle.tsx      # 管理员登录 UI + useAdmin() hook
```

### 1.3 为什么类型要拆两个文件

- `lib/ipbrand-types.ts`：**纯类型和纯函数**，不带 `node:fs`，前端浏览器能安全引用（合并逻辑客户端要用）。
- `lib/ipbrand-admin.ts`：**文件系统操作**（读 JSON、写图片），只能在服务端（API 路由）用。

这是刻意设计：如果混在一起，客户端 import 时会拉到服务端代码，导致构建失败。

---

## 2. 管理员认证机制

| 层 | 机制 | 说明 |
|----|------|------|
| 前端 | `localStorage` 两个键 | `ip-hot-admin`='1'（是否管理员）、`ip-hot-admin-pw`（密码，请求时带上） |
| 登录 | `POST /api/admin/auth` | 输入密码，比对 `ADMIN_PASSWORD` 环境变量，对则存 localStorage |
| 接口校验 | 请求头 `x-admin-password` | 服务端 `isAdminAuthenticated()` 与 `ADMIN_PASSWORD` 比对；也接受 `CRON_SECRET` Bearer（定时任务用） |
| 组件开关 | `useAdmin()` hook | 返回 `{ isAdmin, loaded }`，页面据此显示/隐藏管理按钮 |

**密码**：`ADMIN_PASSWORD`（本地在 `.env.local`，生产在 `shared/.env.production.local`）。

---

## 3. 功能清单与交互逻辑

### 3.1 列表页 `/ipbrand`

**对所有人（游客）：**
- 顶部搜索框：输入即实时过滤（80ms 防抖），搜 IP 名/英文名/版权方/分类/简介全文
- 分类胶囊筛选（卡通动漫 1233 个等，带数量）+ 首字母 A-Z / # 筛选，三重条件叠加
- 8 列正方形封面卡，点卡片进详情页；右下角案例数徽标

**对管理员（登录后）：**
- 每张卡片右上角出现 ✕ **删除按钮**（hover 才显示）
  - 点击 → 弹确认框（显示 IP 名 + "不可撤销"警告）→ 确认 → 调 `delete` 接口 → 列表即时少一张
  - 后端逻辑：把 id 追加到增量 `deleted`，前端合并时过滤掉
- 搜索框右侧出现 **"＋ 新增 IP"按钮**（右对齐）
  - 点击 → 跳 `/ipbrand/new` 新页面填表

### 3.2 详情页 `/ipbrand/detail?id=`

**展示结构（从上到下）：**
1. Hero 区：封面（左）+ 名称/英文名 + **维度信息卡**（版权方/专业分类/国家/年代/授权有效期/受众/可授权地区/重点品类/自定义维度）
2. IP 介绍卡片
3. 版权方介绍卡片
4. 对外展示图（横向滚动图廊，点击看大图）
5. 授权案例卡片（一行 6 个案例：图 + 名称 + 日期）
6. 自定义卡片（管理员新增的，可多张）
7. 相关新闻（**实时拉全球快讯**，按 IP 核心名搜索最新 10 条；搜不到回退静态新闻列表）
8. 品牌手册（图集展示，纯浏览不可下载）

**管理员编辑模式（点右上角"✎ 编辑"进入）：**
- 所有卡片标题可改（存 `section_titles`）；IP 介绍/版权方介绍正文可改（textarea）
- **维度信息区**：每项就地编辑；受众/地区/品类可加多条（＋添加/删/清空全部）；底部"＋ 新增维度"可加任意自定义维度（如"监修方"）；标准维度有"清除"按钮（清空值后该卡不显示）
- **自定义卡片**：＋ 新增卡片（标题+正文）、上移/下移排序、删除卡片
- **对外展示图**：批量上传 / 单张删除 / **设封面**（图廊里每张图有点"设封面"）
- **授权案例**：批量上传案例图（自动生成新案例条目，再填名称日期）、新增空案例、编辑、删除
- **品牌手册**：批量上传图 / 单张替换 / 单张删除（**即时生效**，不用点保存）
- 底部浮动栏：**保存修改**（写入卡片/文字/维度/图元数据）+ 取消

**编辑态交互要点：**
- 进入编辑时复制一份 `draft`（草稿），所有改动改草稿，点"保存"才一次性写后端
- **保存** = 把草稿全量快照 POST 到 `save-edit`，覆盖该 IP 的 `edits` 条目（整体替换，不是差分）
- **品牌手册例外**：上传/替换/删除是即时写后端（`manuals` 字段），不依赖"保存"按钮——因为手册操作独立于字段编辑

### 3.3 新增 IP 页 `/ipbrand/new`

- 管理员从列表页"＋ 新增 IP"进入
- 表单分区：基本信息（中文名*必填/英文名/首字母自动猜测/一句话简介/封面/展示图多选）→ 介绍正文（IP 介绍/版权方/版权方介绍）→ 维度信息（分类/国家/年代/有效期/受众/地区/品类多值）→ 授权案例（文本条目）
- 点"保存并查看" → multipart 提交 `create` 接口
- 后端流程：校验中文名 → **分配新 id**（静态库最大 id + 1，当前 2014 条 max=2440 → 下一个是 2441）→ 写封面/展示图到 `images/{新id}_{名}/` → 组装完整记录 → push 进 `new_records` → 返回新 id → 前端跳详情页
- 创建后新 IP 立即出现在列表末尾；品牌手册和案例图可在详情页编辑态继续补

### 3.4 一个容易混淆的点：图片元数据 vs 文件

- **展示图上传**：文件立刻写磁盘，但图片**列表**（`images` 数组）只存在于草稿里，**必须点"保存修改"才写入 edits**。中途退出编辑，磁盘会留孤图（无害但不进库）。
- **品牌手册上传**：文件写磁盘 + 元数据（`manuals`）**立即写入**，不需要保存。

---

## 4. 接口清单

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/ipbrand/overrides` | 公开 | 返回管理员增量数据 |
| GET | `/api/articles/search?q=` | 公开 | 全球快讯搜索（详情页相关新闻用） |
| POST | `/api/admin/auth` | 公开 | 密码登录 |
| POST | `/api/admin/ipbrand/delete` | 管理员 | `{id}` 删除 IP |
| POST | `/api/admin/ipbrand/save-edit` | 管理员 | `{id, edit}` 全量保存字段编辑 |
| POST | `/api/admin/ipbrand/create` | 管理员 | multipart 新增 IP（分配 id） |
| POST | `/api/admin/ipbrand/upload-images` | 管理员 | multipart 批量上传展示图/案例图（只写磁盘） |
| POST | `/api/admin/ipbrand/upload-manual` | 管理员 | multipart 批量上传手册图（写磁盘+元数据） |
| POST | `/api/admin/ipbrand/delete-manual` | 管理员 | `{id, name}` 删除手册单图 |

管理员接口统一校验请求头 `x-admin-password`，返回 401 表示未授权。

---

## 5. 图片与文件存储

### 5.1 三种环境的上传目录

| 环境 | 图片目录 | 手册目录 |
|------|---------|---------|
| 本地开发 | `public/ipbrand/images`（**symlink → IP365X数据库/images**） | `public/ipbrand/manuals` |
| 本地生产预览 | 同上 | 同上 |
| 线上生产 | `/srv/apps/ip-hot/shared/ipbrand-images` | `/srv/apps/ip-hot/shared/ipbrand-manuals` |

由环境变量控制：`IPBRAND_IMAGE_DIR` / `IPBRAND_MANUAL_DIR`（服务端 `getIpbrandImageDir()` / `getIpbrandManualDir()` 读取）。

### 5.2 浏览器访问路径

- `/ipbrand/images/...` → Nginx alias 直接磁盘服务（不经过 Node）
  - 本地 alias 指向 symlink 的 IP365X 图片目录
  - 生产 alias → `/srv/apps/ip-hot/shared/ipbrand-images/`
- `/ipbrand/manuals/...` → 同样 nginx alias → `/srv/apps/ip-hot/shared/ipbrand-manuals/`

图片 URL 前缀硬编码 `IPBRAND_IMAGE_PREFIX` / `IPBRAND_MANUAL_PREFIX`，存储在增量里的 `local` / `url` 都是相对路径。

### 5.3 文件名规则

- 图片子目录：`{id}_{IP名}`（中文保留，特殊字符去掉）
- 文件唯一名：`{前缀}_{时间戳}_{随机}.{后缀}`，避免覆盖

---

## 6. 部署与运维要点（坑提醒）

### 6.1 本地 build 前必须移走 images symlink ⚠️

**这是最容易踩的坑**：`public/ipbrand/images` 是指向 `IP365X数据库/images` 的**外部 symlink**，Turbopack 生产构建会报错：

```
Symlink ... is invalid, it points out of the filesystem root
```

**本地 build 流程：**
```bash
mv public/ipbrand/images public/ipbrand/images-ip365x-link   # build 前移走
node node_modules/next/dist/bin/next build
mv public/ipbrand/images-ip365x-link public/ipbrand/images   # build 后恢复
```
生产服务器 build 无此问题（git 里 images 被 .gitignore 排除，不存在 symlink）。

### 6.2 部署流程（与主站一致）

1. 本地 commit → `node _push_via_api.mjs`（不能用 git push）
2. 服务器 codeload 下载 tarball → **repack 去掉顶层目录**（`cd ip-hot-{完整sha} && tar -czf /root/ip-hot-release.tar.gz .`）
3. `ops/scripts/install-release /root/ip-hot-release.tar.gz`（服务器自动 npm ci + build + 应用 nginx + 软链 data/ 到 shared/data）
4. 线上验证

### 6.3 生产环境变量（shared/.env.production.local）

```
ADMIN_PASSWORD=...
IPBRAND_IMAGE_DIR=/srv/apps/ip-hot/shared/ipbrand-images
IPBRAND_MANUAL_DIR=/srv/apps/ip-hot/shared/ipbrand-manuals
```

### 6.4 Nginx

`ops/nginx/ip-hot.conf` 两个 alias：
- `/ipbrand/images/` → shared/ipbrand-images
- `/ipbrand/manuals/` → shared/ipbrand-manuals（2026-08-18 新增）

### 6.5 数据持久化保障

`data/ipbrand-admin.json` 在生产被 install-release **软链到 `/srv/apps/ip-hot/shared/data`**，发布新版本不覆盖，管理员改的数据跨发布保留。

---

## 7. 常见问题排查

| 现象 | 可能原因 | 处理 |
|------|---------|------|
| 本地 build 报 symlink 错误 | images 外部 symlink | 按 6.1 移走再 build |
| 列表/详情页数据不更新 | overrides 接口挂了 / 增量文件损坏 | curl `/api/ipbrand/overrides` 看返回 |
| 上传图片后列表没图 | 只上传没点"保存修改"（展示图元数据走保存） | 编辑态点保存 |
| 手册图上传后立即生效但刷新消失 | 手册元数据写入失败 | 查 `data/ipbrand-admin.json` 的 `manuals` 字段 |
| 管理员接口 401 | 密码头没带 / `ADMIN_PASSWORD` 没配 | 确认 localStorage 有 `ip-hot-admin-pw`，env 有密码 |
| 生产图片 403 | `/srv/apps/ip-hot/` 目录权限不是 711 | `chmod o+x /srv/apps/ip-hot`（历史踩坑） |
| 相关新闻为空 | IP 名带冒号/括号，搜索词取不到核心名 | 详情页自动提取冒号前段搜索（已实现） |

---

## 8. 已知边界与后续建议

- **新增 IP 的首字母**：中文名默认归 "#"，管理员可在新增页下拉手动选 A-Z（没有内置拼音库，避免依赖）
- **新增 IP 的案例图**：创建时只能传文本案例，案例图需创建后进详情页编辑态补
- **编辑删除"标准维度"**：语义是清空值（卡片不显示），不是物理删字段
- **数据量**：增量文件会随编辑累积，但每个 IP 只存一份快照，量级可控
- **建议**：如果后续要批量上传 PDF 手册，可在前端加 PDF 转图预处理（当前需先转图再传）

---

*交接文档完 · 有任何疑问优先看 `lib/ipbrand-types.ts` 的类型定义和 `IpDetailClient.tsx` 的编辑态逻辑（两者是理解全貌最快的入口）*
