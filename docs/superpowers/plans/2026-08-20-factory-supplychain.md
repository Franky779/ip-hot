# 文创/IP 工厂供应链库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 IP品牌库旁新增 `/factory` 文创/IP 工厂供应链库，提供列表筛选、详情展示、管理员编辑/删除、新增供应链和二维码联系信息管理，并启动本地预览。

**Architecture:** 复用 IP品牌库的列表/详情/新增三页交互和管理员认证；供应链使用 `public/factory/factories.json` 静态基线 + `data/supplychain-admin.json` 管理员增量合并模型。图片存独立目录，二维码由 `contact_public` 开关控制公开或隐藏。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、CSS、Node.js `fs`、现有 `AdminToggle` 和 `admin-auth`。

---

## 文件职责地图

- Create `lib/factory-types.ts`: FactoryRecord、增量配置类型、合并函数和固定品类/产业带选项。
- Create `lib/factory-admin.ts`: 增量 JSON 读写、图片目录和唯一文件名工具。
- Create `public/factory/factories.json`: 首版 10-15 家数据的空基线模板，先放可审核的示例记录。
- Create `data/supplychain-admin.json`: `deleted/edits/new_records/config` 空增量。
- Create `app/factory/page.tsx`, `FactoryClient.tsx`: 列表、搜索、品类/产业带筛选、管理员删除和新增入口。
- Create `app/factory/detail/page.tsx`, `FactoryDetailClient.tsx`: 详情展示、编辑模式、图片、二维码。
- Create `app/factory/new/page.tsx`, `FactoryNewClient.tsx`: 新增供应链表单。
- Create `app/api/factory/overrides/route.ts`: 公开返回增量合并数据所需的 overrides。
- Create `app/api/admin/factory/delete/route.ts`: 管理员软删除。
- Create `app/api/admin/factory/save-edit/route.ts`: 管理员全量保存编辑快照。
- Create `app/api/admin/factory/create/route.ts`: multipart 创建供应链并分配新 id。
- Create `app/api/admin/factory/upload-images/route.ts`: 批量上传工厂图片。
- Create `app/api/admin/factory/upload-qr/route.ts`: 批量上传二维码图片并写入增量。
- Create `app/api/admin/factory/delete-qr/route.ts`: 删除单张二维码。
- Create `app/api/admin/factory/set-config/route.ts`: 切换 `contact_public`。
- Modify `app/components/Sidebar.tsx`: 增加 `/factory` 侧边栏入口。
- Modify `app/globals.css`: 增加 factory 列表、详情、编辑和新增页样式。
- Modify `ops/nginx/ip-hot.conf`: 增加 `/factory/images/` alias。

### Task 1: 建立供应链数据模型和静态基线

**Files:**
- Create: `lib/factory-types.ts`
- Create: `lib/factory-admin.ts`
- Create: `public/factory/factories.json`
- Create: `data/supplychain-admin.json`

- [ ] 定义 `FactoryRecord`，字段严格为：`id/name/images/one_line/categories/hub/location/own_brand/supply_type/ip_project_count/qr_images`。
- [ ] 定义 `FactoryAdminData`：`deleted:number[]`、`edits:Record<string, Partial<FactoryRecord>>`、`new_records:FactoryRecord[]`、`config:{contact_public:boolean}`。
- [ ] 实现 `mergeFactoryRecords(records, admin)`：过滤 deleted、应用 edits、追加 new_records；不泄露 `qr_images` 以外的 IP 名称字段（数据模型不存 IP 名单）。
- [ ] 实现 `loadFactoryAdmin()` / `saveFactoryAdmin()`，兼容缺失旧字段并默认 `config.contact_public=true`。
- [ ] 固定导出 `FACTORY_CATEGORIES`、`FACTORY_HUBS`，供新增页勾选和列表筛选复用。
- [ ] 建立 10-15 家审核用示例基线记录，图片先使用空数组；示例数据明确标注为待补充资料，不伪造具体企业合作 IP 数量。
- [ ] 运行 `node -e` 解析 JSON，预期输出记录数量和所有记录具备 11 个业务字段。

### Task 2: 增加公开与管理员 API

**Files:**
- Create: `app/api/factory/overrides/route.ts`
- Create: `app/api/admin/factory/delete/route.ts`
- Create: `app/api/admin/factory/save-edit/route.ts`
- Create: `app/api/admin/factory/create/route.ts`
- Create: `app/api/admin/factory/upload-images/route.ts`
- Create: `app/api/admin/factory/upload-qr/route.ts`
- Create: `app/api/admin/factory/delete-qr/route.ts`
- Create: `app/api/admin/factory/set-config/route.ts`

- [ ] 所有管理员接口调用 `isAdminAuthenticated(request)`，失败返回 401。
- [ ] `overrides` 返回 `loadFactoryAdmin()`；异常时返回完整空结构，包含 `config`。
- [ ] `delete` 校验正整数 id，追加 deleted 并保存。
- [ ] `save-edit` 校验 id 和 object edit，整体覆盖 edits[id]。
- [ ] `create` 接收 multipart，校验 name，计算静态基线与 new_records 最大 id + 1，写入图片并追加 new_records。
- [ ] `upload-images` 仅允许 jpg/jpeg/png/webp/gif，限制单文件 15MB、单次 30 张，返回相对 local 路径。
- [ ] `upload-qr` 仅允许图片，限制单文件 10MB、单次 10 张，追加 qr_images 并持久化。
- [ ] `delete-qr` 校验文件名不得含路径穿越字符，删除磁盘文件并更新 qr_images。
- [ ] `set-config` 只允许修改 boolean `contact_public`。
- [ ] 用 curl 发送未授权请求，所有管理员接口预期 401；用合法密码发送 overrides 预期 200。

### Task 3: 实现列表页和侧边栏入口

**Files:**
- Create: `app/factory/page.tsx`
- Create: `app/factory/FactoryClient.tsx`
- Modify: `app/components/Sidebar.tsx`

- [ ] 列表页加载 factories.json 与 overrides 并合并。
- [ ] 实现 80ms 搜索防抖，搜索 name、one_line、categories、hub、location、supply_type。
- [ ] 实现主营品类动态数量胶囊和产业带动态数量胶囊，两个筛选条件叠加。
- [ ] 卡片使用 images[0] 作为封面；无图时显示名称首字占位。
- [ ] 卡片显示供应链名称、定位、品类标签、所在地、供应链性质、合作 IP 项目数量。
- [ ] 管理员显示删除按钮和确认弹窗；删除成功后本地即时移除。
- [ ] 管理员在搜索框右侧显示“＋ 新增供应链”，链接 `/factory/new`。
- [ ] Sidebar 增加 `/factory` 入口并在子路由高亮。
- [ ] 使用现有 IP品牌库 CSS 视觉语言，不引入新依赖。

### Task 4: 实现详情页展示和编辑模式

**Files:**
- Create: `app/factory/detail/page.tsx`
- Create: `app/factory/detail/FactoryDetailClient.tsx`

- [ ] 展示 Hero：images[0]、供应链名称、定位。
- [ ] 展示维度卡：主营品类、产业带、所在地、自有品牌、供应链性质、合作 IP 项目数。
- [ ] 展示图片横向图廊，点击图片新窗口查看；无图显示空状态。
- [ ] 联系信息区按 `config.contact_public`：true 显示二维码，false 显示隐藏占位；不显示具体 IP 名称。
- [ ] 管理员编辑态复制 draft，支持名称/定位/品类勾选/产业带/所在地/自有品牌/供应链性质/IP 数量编辑。
- [ ] 图片支持批量上传、设首图、删除和上下移动；保存时写入 images 数组。
- [ ] 二维码支持即时批量上传和单张删除，不依赖普通字段保存。
- [ ] 增加“联系方式公开/隐藏”开关，调用 set-config 后更新页面。
- [ ] 普通字段保存调用 save-edit，取消编辑丢弃 draft。

### Task 5: 实现新增供应链页面

**Files:**
- Create: `app/factory/new/page.tsx`
- Create: `app/factory/new/FactoryNewClient.tsx`

- [ ] 表单严格只包含确认字段：名称、定位、图片、主营品类、产业带、所在地、自有品牌、供应链性质、合作 IP 数量、二维码。
- [ ] 品类使用 FACTORY_CATEGORIES 多选；产业带使用 FACTORY_HUBS 单选；供应链性质使用 OEM/ODM/自有品牌单选。
- [ ] 图片可多选，第一张作为封面；二维码可多选。
- [ ] 名称为空时阻止提交并显示中文错误。
- [ ] 保存调用 create，成功后按返回 id 跳转详情页。
- [ ] 非管理员显示“请先登录管理员身份”，不渲染提交表单。

### Task 6: CSS、Nginx 和本地数据准备

**Files:**
- Modify: `app/globals.css`
- Modify: `ops/nginx/ip-hot.conf`

- [ ] 增加 factory 命名空间样式：列表 topbar/筛选/卡片、详情 hero/meta/gallery/二维码、编辑态、表单页。
- [ ] 保持移动端布局：列表 2 列、详情单列、表单单列；二维码图片限制最大宽度。
- [ ] Nginx 增加 `location /factory/images/ { alias /srv/apps/ip-hot/shared/factory-images/; }`。
- [ ] 本地创建 `public/factory/images` 目录；不创建外部 symlink，避免 IP品牌库 build 坑。
- [ ] 增加本地示例数据的图片占位策略，不伪造真实企业 Logo 或合作关系。

### Task 7: 构建和本地预览验收

**Files:**
- No new files; verify all files above.

- [ ] 先运行 TypeScript/build 检查；若本地存在 `public/ipbrand/images` 外部 symlink，按 IP品牌库交接文档临时移走后 build，再恢复。
- [ ] 启动本地生产预览（使用空闲端口，如 3100），验证 `/factory`、`/factory/detail?id=1`、`/factory/new` 返回 200。
- [ ] 使用管理员 localStorage 验证：新增按钮、删除确认框、详情编辑按钮、二维码上传控件、contact_public 开关。
- [ ] 验证筛选：品类和产业带能叠加，搜索能命中名称/定位/所在地。
- [ ] 验证新增：填最小字段创建后返回详情，列表数量增加；再删除测试记录并恢复增量 JSON。
- [ ] 验证图片/二维码 URL 返回 200；清理全部测试文件和临时 server。
- [ ] 给用户发送本地预览地址和审核说明，不部署生产。

---

## 实施边界

- 本轮不联网采集真实 1688/展会数据，不伪造工厂、品牌、IP 合作数量；先搭代码和可审核页面。
- 本轮不部署生产；用户审核本地预览后再做数据采集和上线。
- 联系方式目前通过 `contact_public` 全局开关控制，后期可在此基础上接会员/收费权限。