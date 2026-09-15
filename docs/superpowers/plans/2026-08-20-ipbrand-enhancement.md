# IP 品牌库增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/ipbrand` 增加白底封面、平台收录标准、全站共用分类词库和可持久化相关新闻编辑能力。

**Architecture:** 继续使用 `public/ipbrand/ips.json` 静态基线 + `data/ipbrand-admin.json` 管理员增量。新增全站词库增量配置和 IP 相关新闻覆盖字段；词库写操作由管理员 API 完成，关联统计和批量改名在服务端基于当前合并后的 IP 数据执行。详情页编辑态继续使用 `draft`，词库选择和相关新闻操作在点击“保存修改”时整体持久化。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、PostgreSQL 适配层、Node 原生 `node:test`、现有 CSS 变量主题系统。

---

## 文件映射

- Modify: `lib/ipbrand-types.ts` — 扩展词库、相关新闻类型；增加纯函数：词库汇总、词库操作、关联计数、资讯去重。
- Modify: `lib/ipbrand-admin.ts` — 规范化管理员增量数据、原子写入 JSON、保留新字段。
- Modify: `data/ipbrand-admin.json` — 增加空的 `options` 结构，保持已有数据兼容。
- Create: `app/api/ipbrand/options/route.ts` — 公开读取四类可用词库选项。
- Create: `app/api/admin/ipbrand/options/route.ts` — 管理员新增、改名、删除词库选项。
- Modify: `app/api/ipbrand/overrides/route.ts` — 返回兼容的新增量结构，异常时包含空 `options`。
- Modify: `app/api/articles/search/route.ts` — 支持重复 `q` 参数、多关键词合并、稳定 ID/简介/来源返回。
- Modify: `app/api/admin/ipbrand/save-edit/route.ts` — 保存相关新闻覆盖字段，继续执行管理员鉴权和全量快照保存。
- Modify: `app/ipbrand/IpBrandClient.tsx` — 添加平台收录标准；封面外层白底；案例徽标绿色边框。
- Modify: `app/ipbrand/detail/IpDetailClient.tsx` — 读取词库、渲染单选/多选编辑控件、词库管理弹窗、自动匹配和相关新闻删除/保存。
- Modify: `app/globals.css` — 列表顶部布局、封面白底、绿色案例徽标、词库控件、资讯删除按钮和响应式规则。
- Create: `lib/ipbrand-types.test.ts` — 纯函数和边界行为测试。
- Create: `lib/ipbrand-admin-options.test.ts` — 服务端词库操作规则测试；只测试纯 helper，不写真实 `data/`。

---

### Task 1: 扩展 IP 品牌库类型与纯逻辑

**Files:**
- Modify: `lib/ipbrand-types.ts`
- Create: `lib/ipbrand-types.test.ts`

- [ ] **Step 1: 写失败测试，锁定数据模型和纯函数行为**

在 `lib/ipbrand-types.test.ts` 增加以下测试场景：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildIpBrandOptions,
  countOptionUsage,
  dedupeIpNews,
  applyOptionRename,
  type IpBrandAdminData,
  type IpNews,
  type IpRecord,
} from './ipbrand-types.ts'

const record = (patch: Partial<IpRecord> = {}): IpRecord => ({
  id: 1, name_cn: '甲', name_en: 'A', initial: '#', cover: '', images: [], case_len: 0,
  category: '卡通动漫', place_origin: '日本', company: '甲公司', one_line_intro: '甲简介',
  ip_intro: '甲介绍', company_intro: '', areas: ['中国'], ages: ['儿童'], industries: ['玩具'],
  listing_date: '', auth_start: '', auth_end: '', licensor_case_list: [], news_list: [], source_url: '',
  ...patch,
})

test('derives four option lists from current records and admin additions/removals', () => {
  const records = [record(), record({ id: 2, category: '潮流时尚', ages: ['儿童', '青年'] })]
  const admin: IpBrandAdminData = {
    deleted: [], edits: {}, manuals: {}, new_records: [],
    options: {
      category: { added: ['企业品牌'], removed: ['潮流时尚'] },
      place_origin: { added: [], removed: [] },
      ages: { added: [], removed: [] },
      industries: { added: [], removed: [] },
    },
  }
  assert.deepEqual(buildIpBrandOptions(records, admin).category, ['卡通动漫', '企业品牌'])
  assert.deepEqual(buildIpBrandOptions(records, admin).ages, ['儿童', '青年'])
})

test('counts usage across scalar and array fields', () => {
  const records = [record(), record({ id: 2, category: '卡通动漫', industries: ['玩具', '服装'] })]
  assert.equal(countOptionUsage(records, 'category', '卡通动漫'), 2)
  assert.equal(countOptionUsage(records, 'industries', '玩具'), 2)
  assert.equal(countOptionUsage(records, 'industries', '服装'), 1)
})

test('renames scalar and array values without duplicate array values', () => {
  const records = [record(), record({ id: 2, ages: ['青年', '儿童'] })]
  const result = applyOptionRename(records, 'ages', '儿童', '未成年人')
  assert.deepEqual(result[0].ages, ['未成年人'])
  assert.deepEqual(result[1].ages, ['青年', '未成年人'])
})

test('deduplicates news by id and falls back to url', () => {
  const news: IpNews[] = [
    { id: '1', title: 'A', url: 'https://a', published_at: '2026-08-20' },
    { id: '1', title: 'A duplicate', url: 'https://a2' },
    { title: 'B', url: 'https://b' },
    { title: 'B duplicate', url: 'https://b' },
  ]
  assert.equal(dedupeIpNews(news).length, 2)
})
```

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `node --experimental-strip-types --test lib/ipbrand-types.test.ts`

Expected: FAIL because the new types and pure functions do not exist yet.

- [ ] **Step 3: 实现类型与纯函数**

在 `lib/ipbrand-types.ts` 增加以下定义和行为：

```ts
export type IpBrandOptionField = 'category' | 'place_origin' | 'ages' | 'industries'
export type IpBrandOptionConfig = { added: string[]; removed: string[] }
export type IpBrandOptions = Record<IpBrandOptionField, IpBrandOptionConfig>

export type IpNews = {
  id?: string
  source?: string
  url?: string
  title?: string
  title_cn?: string | null
  summary_cn?: string | null
  published_at?: string | null
  created_at?: string | null
}

export type IpBrandEdit = Partial<{
  // existing fields...
  related_news: IpNews[]
}>

export type IpBrandAdminData = {
  deleted: number[]
  edits: Record<string, IpBrandEdit>
  manuals: Record<string, IpManualItem[]>
  new_records: IpRecord[]
  options: Partial<IpBrandOptions>
}
```

实现 `buildIpBrandOptions(records, admin)`：

- 从当前记录的 `category`、`place_origin`、`ages`、`industries` 汇总非空值。
- 合并 `admin.options[field]?.added`。
- 删除 `admin.options[field]?.removed`。
- 去重后按 `localeCompare` 排序。
- 缺少旧字段时按空数组处理，确保旧 `ipbrand-admin.json` 可读。

实现 `countOptionUsage(records, field, value)`：单值字段按相等计数，多值字段按数组包含计数，每个 IP 最多计数一次。

实现 `applyOptionRename(records, field, from, to)`：只返回数据副本；单值直接替换，多值替换后去重，不修改静态输入对象。

实现 `dedupeIpNews(news)`：优先用 `id` 去重；没有 ID 时用非空 `url` 去重；没有 ID 和 URL 的条目保留一次。保留首次出现顺序。

扩展 `mergeIpRecords()`：继续合并 edits，并将 `related_news` 保留为可区分的三态：字段不存在表示未覆盖，空数组表示管理员明确保存为空，非空数组表示管理员覆盖资讯。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --test lib/ipbrand-types.test.ts`

Expected: PASS，所有词库汇总、关联计数、批量改名、资讯去重测试通过。

- [ ] **Step 5: 提交类型与纯逻辑**

```bash
git add lib/ipbrand-types.ts lib/ipbrand-types.test.ts
git commit -m "feat(ipbrand): add option and news domain types"
```

---

### Task 2: 规范管理员增量与词库服务端操作

**Files:**
- Modify: `lib/ipbrand-admin.ts`
- Modify: `data/ipbrand-admin.json`
- Create: `lib/ipbrand-admin-options.test.ts`

- [ ] **Step 1: 写失败测试，锁定词库操作规则**

在 `lib/ipbrand-admin-options.test.ts` 测试纯 helper：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { createOption, renameOption, removeOption } from './ipbrand-admin.ts'

test('createOption trims input and rejects empty or duplicate values', () => {
  const state = { added: ['卡通动漫'], removed: [] }
  assert.deepEqual(createOption(state, '  企业品牌  '), { added: ['卡通动漫', '企业品牌'], removed: [] })
  assert.throws(() => createOption(state, '   '), /不能为空/)
  assert.throws(() => createOption(state, '卡通动漫'), /已存在/)
})

test('renameOption rejects duplicate target and records old value as removed', () => {
  const state = { added: ['企业品牌'], removed: [] }
  assert.deepEqual(renameOption(state, '卡通动漫', '潮流时尚'), {
    added: ['企业品牌', '潮流时尚'], removed: ['卡通动漫'],
  })
  assert.throws(() => renameOption(state, '卡通动漫', '企业品牌'), /已存在/)
})

test('removeOption only removes values that have no current usage', () => {
  const state = { added: ['企业品牌'], removed: [] }
  assert.deepEqual(removeOption(state, '企业品牌', 0), { added: [], removed: ['企业品牌'] })
  assert.throws(() => removeOption(state, '企业品牌', 3), /还有 3 条信息与该选项关联/)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --test lib/ipbrand-admin-options.test.ts`

Expected: FAIL because the option helpers do not exist.

- [ ] **Step 3: 实现兼容加载、原子写入和词库 helper**

在 `lib/ipbrand-admin.ts`：

- 让 `loadIpBrandAdmin()` 对旧文件补齐 `options: {}`，并确保 `deleted`、`edits`、`manuals`、`new_records` 类型正确。
- 导出 `createOption(state, value)`、`renameOption(state, from, to)`、`removeOption(state, value, usageCount)`，全部复制输入数组后返回新对象。
- `renameOption` 的结果是把目标值加入 `added`、原值加入 `removed`；若原值本来是 `added`，从 `added` 移除后再把目标加入；禁止空值、同值和目标重复。
- `removeOption` 在 `usageCount > 0` 时抛出包含准确数量的错误；否则从 `added` 移除并把值加入 `removed`，避免静态基线重新衍生出已删除值。
- 将 `saveIpBrandAdmin()` 改为先写同目录临时文件，再 `renameSync` 替换目标文件；保留 UTF-8 JSON 格式。

将 `data/ipbrand-admin.json` 更新为：

```json
{
  "deleted": [],
  "edits": {},
  "manuals": {},
  "new_records": [],
  "options": {}
}
```

- [ ] **Step 4: 运行词库 helper 测试**

Run: `node --experimental-strip-types --test lib/ipbrand-admin-options.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交管理员增量兼容层**

```bash
git add lib/ipbrand-admin.ts data/ipbrand-admin.json lib/ipbrand-admin-options.test.ts
git commit -m "feat(ipbrand): persist shared option metadata safely"
```

---

### Task 3: 增加词库读取、维护和关联统计 API

**Files:**
- Create: `app/api/ipbrand/options/route.ts`
- Create: `app/api/admin/ipbrand/options/route.ts`
- Modify: `app/api/ipbrand/overrides/route.ts`

- [ ] **Step 1: 实现公开词库读取接口**

`GET /api/ipbrand/options` 按以下流程实现：

1. 读取 `public/ipbrand/ips.json`。
2. 读取 `loadIpBrandAdmin()`。
3. 调用 `mergeIpRecords(records, admin)` 得到当前记录。
4. 返回 `buildIpBrandOptions(currentRecords, admin)`，响应格式为：

```json
{
  "category": ["卡通动漫"],
  "place_origin": ["日本"],
  "ages": ["儿童"],
  "industries": ["玩具"]
}
```

读取失败返回同样结构的四个空数组和 HTTP 200，避免编辑页崩溃。

- [ ] **Step 2: 实现管理员词库 API**

`POST /api/admin/ipbrand/options` 接收：

```ts
{ action: 'add' | 'rename' | 'delete'; field: IpBrandOptionField; value: string; newValue?: string }
```

统一先执行 `isAdminAuthenticated(request)`，未授权返回 401。

处理逻辑：

- `add`：调用 `createOption`，写回 `admin.options[field]`。
- `rename`：先读取静态基线并合并当前记录；调用 `countOptionUsage(currentRecords, field, value)`；调用 `applyOptionRename()` 对所有受影响记录生成管理员 edit 覆盖；更新 `admin.edits[id]` 时只覆盖对应字段，保留该 IP 已有编辑字段；调用 `renameOption` 更新词库状态；一次写回。
- `delete`：重新计算关联数；大于 0 返回 HTTP 409 和 `{ error, usageCount }`；为 0 调用 `removeOption` 后写回。
- 其他 action、field、空值或缺少 `newValue` 返回 400。

批量改名时必须从当前合并记录生成每个受影响 IP 的字段覆盖：

- `category`、`place_origin` 直接写字符串。
- `ages`、`industries` 写替换并去重后的数组。
- 其他已有 `edits` 字段原样保留。

成功返回最新 `buildIpBrandOptions(currentRecordsAfterChange, admin)`，让前端可以立即刷新词库。

- [ ] **Step 3: 更新 overrides 异常响应**

`app/api/ipbrand/overrides/route.ts` 的异常响应补齐 `options: {}`、`new_records: []`，使旧数据和异常数据都满足 `IpBrandAdminData` 结构。

- [ ] **Step 4: 手工验证 API 合同**

在本地 dev server 启动后运行：

```bash
curl.exe -s http://127.0.0.1:3010/api/ipbrand/options
curl.exe -i -s -X POST http://127.0.0.1:3010/api/admin/ipbrand/options -H "Content-Type: application/json" --data "{\"action\":\"delete\",\"field\":\"category\",\"value\":\"卡通动漫\"}"
```

Expected：GET 返回四个数组；未带管理员密码的 POST 返回 `401 Unauthorized`。不要对真实生产站发送写请求。

- [ ] **Step 5: 提交词库 API**

```bash
git add app/api/ipbrand/options/route.ts app/api/admin/ipbrand/options/route.ts app/api/ipbrand/overrides/route.ts
git commit -m "feat(ipbrand): add shared option management APIs"
```

---

### Task 4: 扩展全球快讯搜索和 IP 编辑保存

**Files:**
- Modify: `app/api/articles/search/route.ts`
- Modify: `app/api/admin/ipbrand/save-edit/route.ts`

- [ ] **Step 1: 扩展搜索接口响应字段和多关键词逻辑**

`GET /api/articles/search` 支持多个重复的 `q` 参数：

```text
/api/articles/search?q=哆啦A梦&q=儿童&q=玩具
```

实现规则：

- `getAll('q')` 后逐项 trim，过滤空值，最多取 5 个关键词。
- 每个关键词继续使用 `createArticleSearchPattern` 和现有标题/中文标题/简介过滤。
- 每次查询选择 `id, source, url, title, title_cn, summary_cn, category, published_at, created_at`，保留现有质量过滤条件。
- 合并所有结果，按资讯 `id` 去重；没有 ID 时按 URL 去重；按 `published_at`、`created_at` 倒序排序，最多返回 10 条。
- 单个关键词查询失败不应让整个接口 500；所有查询都失败时返回 `{ articles: [] }`。

- [ ] **Step 2: 扩展 `FeedArticle`/IP 新闻类型兼容**

把 `IpNews` 的 `id` 统一转成字符串后保存，保留 `source`、`url`、`title`、`title_cn`、`summary_cn`、`published_at`、`created_at`。现有单关键词调用结果保持兼容。

- [ ] **Step 3: 保存相关新闻覆盖字段**

确认 `save-edit` 接收的 `edit.related_news` 只能是数组；每个条目过滤到允许字段后调用 `dedupeIpNews()`。字段不存在表示动态匹配，空数组表示管理员明确保存为空。

不改变现有管理员鉴权、ID 校验和全量替换 `edits[String(id)]` 的行为。

- [ ] **Step 4: 运行现有搜索测试和 TypeScript 检查**

Run: `node --experimental-strip-types --test lib/article-search.test.ts lib/ipbrand-types.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit`

Expected: PASS；若发现旧 `IpNews` 使用点，按可选字段补齐，不改无关模块。

- [ ] **Step 5: 提交快讯与保存接口**

```bash
git add app/api/articles/search/route.ts app/api/admin/ipbrand/save-edit/route.ts lib/ipbrand-types.ts
git commit -m "feat(ipbrand): persist and search related global news"
```

---

### Task 5: 完成列表页封面、徽标和平台标准文字

**Files:**
- Modify: `app/ipbrand/IpBrandClient.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 改列表结构**

在 `.ipb-brand` 内保留现有“IP 品牌库”标题，并将统计行改为同一行容器：

```tsx
<div className="ipb-brand-meta">
  <div className="ipb-brand-count">{data ? `共 ${data.length} 个 IP` : '—'}</div>
  <div className="ipb-brand-standard">平台IP收录标准：全网粉丝2W+，且正规商业授权案例5个以上</div>
</div>
```

封面容器保持 `.ipb-card-cover`，只确保 `<img>` 放在白底容器内；不改变图片 URL 和懒加载逻辑。

- [ ] **Step 2: 改列表样式**

在 `app/globals.css` 的 IP 品牌库样式段落中：

- `.ipb-brand-meta` 使用 `display:flex; align-items:baseline; gap:.75rem; flex-wrap:wrap`。
- `.ipb-brand-standard` 使用与 `.ipb-brand-count` 相同的颜色、字体和字号，不加粗、不增加装饰。
- `.ipb-card-cover` 增加 `background:#fff`；`.ipb-card-cover img` 使用 `object-fit:contain`，继续保持正方形框和 hover 缩放不改变布局。
- `.ipb-case-badge` 改为 `border:1px solid var(--accent); color:var(--accent); background:rgba(255,255,255,.9)`；`.zero` 只降低透明度，不改绿色边框体系。
- 在现有 `max-width: 900px` 和 `max-width: 560px` 媒体规则中，确保顶部标准文字能换行；移动端不要隐藏 `.ipb-brand-meta`。

- [ ] **Step 3: 运行 lint 并检查暗色/亮色 CSS**

Run: `npm run lint`

Expected: PASS。

用浏览器检查 `/ipbrand`：透明 PNG 透明区域为白色，案例徽标绿色，顶部标准文字不遮挡搜索框；切换亮色/暗色主题后仍清晰。

- [ ] **Step 4: 提交列表页视觉改动**

```bash
git add app/ipbrand/IpBrandClient.tsx app/globals.css
git commit -m "feat(ipbrand): improve cover and listing standard display"
```

---

### Task 6: 实现详情页词库控件与全站词库管理

**Files:**
- Modify: `app/ipbrand/detail/IpDetailClient.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 增加词库状态和读取逻辑**

在 `IpDetailClient` 增加：

```ts
type IpBrandOptionsResponse = Record<IpBrandOptionField, string[]>
const EMPTY_OPTIONS: IpBrandOptionsResponse = {
  category: [], place_origin: [], ages: [], industries: [],
}
const [options, setOptions] = useState(EMPTY_OPTIONS)
const [optionsBusy, setOptionsBusy] = useState(false)
const [optionManager, setOptionManager] = useState<{ field: IpBrandOptionField; value?: string } | null>(null)
```

页面初次加载时与 `ips.json`、overrides 并行读取 `/api/ipbrand/options`；失败时使用空数组但不阻止详情页展示。

- [ ] **Step 2: 实现管理员新增、改名、删除词库操作**

增加统一 `mutateOption(action, field, value, newValue?)`：

- 从 `localStorage` 取管理员密码，发送到 `/api/admin/ipbrand/options`。
- `409` 时读取 `usageCount`，显示服务端返回的“还有 N 条信息与该选项关联，请批量调整”，不修改本地选项。
- 成功后用响应中的 options 更新状态；新增值成功时自动加入当前 draft 的对应字段。
- 删除在发送请求前显示现有确认框；只有服务端成功后才从选项列表移除。

管理控件不使用自由文本替代字段值；新增/改名仅在词库管理的小弹窗中输入。

- [ ] **Step 3: 替换四个目标字段的编辑 JSX**

保留“版权方”“IP诞生年代”“授权有效期”的现有输入；只替换四个目标字段：

- `category`、`place_origin`：原生 `<select>`，第一项为“未选择”，后续使用 `options[field]`；旁边放“＋管理选项”按钮。
- `ages`、`industries`：展示已选标签；点击“＋添加”打开选项菜单，选中已有值后去重加入数组；每个标签用 `×` 按钮删除；旁边放“管理选项”。
- 清空单值字段设置为空字符串。
- 多值字段不再渲染可自由输入的 `<input>`。

管理弹窗展示当前字段选项，每项有“改名”“删除”；底部有新增输入和“新增”按钮。删除按钮的关联阻止提示使用服务端原文。

- [ ] **Step 4: 样式实现 A/B 视觉选择**

在 `app/globals.css` 增加：

- `.ipd-option-select`、`.ipd-option-manager`：沿用现有输入框边框、背景、字体和主题变量。
- `.ipd-tag-list`、`.ipd-option-tag`、`.ipd-option-tag-remove`：标签型多选，品牌绿用于选中状态，按钮尺寸固定，文字不溢出。
- `.ipd-option-picker`：相对定位的菜单，最大高度滚动；移动端不超出视口。
- `.ipd-option-modal` 与遮罩：复用现有确认框风格，管理新增、改名、删除。
- 暗色主题下显式设置 `select/option` 的背景和文字颜色，与已有全局 select 规则一致。

- [ ] **Step 5: 运行 TypeScript 和 lint**

Run: `npx tsc --noEmit`

Expected: PASS。

Run: `npm run lint`

Expected: PASS。

- [ ] **Step 6: 提交词库编辑 UI**

```bash
git add app/ipbrand/detail/IpDetailClient.tsx app/globals.css
git commit -m "feat(ipbrand): add shared option controls to editor"
```

---

### Task 7: 实现相关新闻自动匹配、删除和持久化展示

**Files:**
- Modify: `app/ipbrand/detail/IpDetailClient.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 统一新闻状态与覆盖语义**

将 `FeedArticle` 扩展为包含 `summary_cn`、`id` 等字段，并增加状态：

```ts
const [feedNews, setFeedNews] = useState<FeedArticle[]>([])
const [newsLoaded, setNewsLoaded] = useState(false)
const [newsBusy, setNewsBusy] = useState(false)
const [newsError, setNewsError] = useState('')
```

加载详情记录后：

- `d.related_news !== undefined` 时直接使用管理员保存的列表，不再自动请求。
- 否则调用自动匹配函数，用核心中文名、英文名和非空简介作为重复 `q` 参数查询。
- 自动匹配失败时保留当前已保存列表（如果存在），否则让展示态回退静态新闻。

- [ ] **Step 2: 实现自动匹配函数**

实现 `matchNews(source: IpRecord)`：

1. 关键词按顺序取 `coreSearchName(name_cn)`、`coreSearchName(name_en)`、`one_line_intro`、`ip_intro`。
2. 过滤空值、去重、最多 5 个完整短语。
3. 构造 `URLSearchParams`，对每个关键词调用 `params.append('q', keyword)`。
4. 请求 `/api/articles/search?${params}`。
5. 合并响应并调用 `dedupeIpNews()`，更新 `feedNews`、`newsLoaded`、`newsError`。

- [ ] **Step 3: 实现编辑态“＋自动匹配”和资讯删除**

相关新闻编辑区改为：

```tsx
<div className="ipd-edit-sec-head">
  <input ... />
  <button className="ipd-news-match-btn" onClick={autoMatchNews} disabled={newsBusy}>
    {newsBusy ? '匹配中…' : '＋自动匹配'}
  </button>
</div>
```

`autoMatchNews` 使用当前 `draft`，请求成功后：

- `setFeedNews(matches)`；
- `patch({ related_news: matches })`，表示这次匹配结果已成为草稿覆盖；
- 空结果也设置 `related_news: []`，让管理员可以明确保存为空。

每条资讯渲染为现有可点击链接，日期右侧增加：

```tsx
<button
  type="button"
  className="ipd-news-delete"
  onClick={event => {
    event.preventDefault()
    event.stopPropagation()
    const next = feedNews.filter(item => item.id !== n.id || item.url !== n.url)
    setFeedNews(next)
    patch({ related_news: next })
  }}
>
  删除
</button>
```

删除条件使用 `id` 优先、URL 兜底，确保没有 ID 的资讯也能删除对应项。

- [ ] **Step 4: 保存后清理和展示态优先级**

保存 `edit` 时把 `related_news` 放入提交快照；保存成功后更新 `data` 中当前记录，并让展示态优先使用该覆盖数组：

- `undefined`：实时自动匹配，空时回退 `news_list`。
- `[]`：展示“暂无相关新闻”，不回退静态新闻。
- 非空数组：展示管理员保存的资讯。

取消编辑时恢复 `d.related_news` 或重新加载的动态列表，不把草稿新闻泄露到展示态。

- [ ] **Step 5: 添加新闻样式并验证响应式**

在 `app/globals.css`：

- `.ipd-news-item` 继续保持整行链接布局。
- `.ipd-news-date` 与 `.ipd-news-delete` 放在右侧同一 flex 行。
- 删除按钮使用低干扰的红色文字/边框，hover 时增强，不改变资讯标题可点击区域。
- `.ipd-news-match-btn` 使用品牌绿边框，编辑态和暗色主题均清晰。
- 小屏允许标题换行，日期和删除按钮不被标题挤出卡片。

- [ ] **Step 6: 运行 lint、类型检查和纯测试**

Run: `node --experimental-strip-types --test lib/ipbrand-types.test.ts lib/article-search.test.ts`

Expected: PASS。

Run: `npx tsc --noEmit && npm run lint`

Expected: PASS。

- [ ] **Step 7: 提交相关新闻 UI**

```bash
git add app/ipbrand/detail/IpDetailClient.tsx app/globals.css
git commit -m "feat(ipbrand): add editable related news matching"
```

---

### Task 8: 集成验证、本地预览与交付前检查

**Files:**
- Modify only if a failing test identifies a regression: the smallest affected file.

- [ ] **Step 1: 运行完整静态检查和项目测试**

Run:

```bash
npm run lint
npm run test:quality
npm run test:deployment
node --experimental-strip-types --test lib/ipbrand-types.test.ts lib/ipbrand-admin-options.test.ts lib/article-search.test.ts
npx tsc --noEmit
```

Expected：全部通过。已有与本任务无关的失败必须记录原始错误，不用无关重构掩盖。

- [ ] **Step 2: 处理 IP 品牌库图片 symlink 后执行 production build**

按交接文档要求，在本地 build 前临时移走 `public/ipbrand/images` 外部 symlink，执行：

```powershell
Move-Item public/ipbrand/images public/ipbrand/images-ip365x-link
npm run build
Move-Item public/ipbrand/images-ip365x-link public/ipbrand/images
```

无论 build 成功或失败，都要确保 symlink 恢复原路径。Expected：Next.js production build 成功。

- [ ] **Step 3: 启动本地预览**

使用本地数据库隧道和 3010 端口启动：

```powershell
npm run dev -- -H 127.0.0.1 -p 3010
```

提供本地地址 `http://127.0.0.1:3010/ipbrand`，不在预览阶段调用生产写接口、批量抓取或 LLM。

- [ ] **Step 4: 用浏览器完成验收清单**

在亮色和暗色主题分别检查：

1. 列表透明 PNG 显示白底，普通图片不裁切。
2. “案例”徽标为品牌绿边框和文字。
3. “共 N 个 IP”右侧紧接平台收录标准；移动宽度下不覆盖搜索框。
4. 详情编辑态的分类/国家为单选下拉，受众/重点品类为标签多选。
5. 新增词库选项后可立即选择。
6. 改名会更新已有关联 IP。
7. 删除仍有关联的选项时显示准确 N 并拒绝删除；关联清零后删除成功。
8. “＋自动匹配”替换结果，不重复叠加；资讯可跳转，日期右侧删除可用。
9. 保存、刷新、重新进入详情页后编辑结果保留。
10. 未登录用户不能写词库或 IP 编辑数据。

- [ ] **Step 5: 等待用户确认预览无误**

在用户明确回复“预览无误”之前，不执行生产部署，不运行服务器写入命令，不同步 GitHub。

- [ ] **Step 6: 交付当前本地实现状态**

汇报通过的检查命令、未通过的命令及原始错误；附带本地预览地址和涉及文件的绝对路径。部署和 GitHub 备份作为用户确认预览后的独立阶段执行。

---

## 计划自检

- 设计文档第 2 节的白底封面、绿色案例徽标、顶部平台标准对应 Task 5。
- 设计文档第 2/3/4 节的全站词库、关联计数、阻止删除和安全持久化对应 Task 1–3、Task 6。
- 设计文档第 2/4/5 节的全球快讯标题/简介搜索、重新匹配、删除、保存和空列表语义对应 Task 4、Task 7。
- 亮色/暗色、移动端换行和原生 select 可读性对应 Task 5、Task 6、Task 7、Task 8。
- 没有使用 TBD、TODO、待定或“适当处理”等占位表述；测试命令、预期结果、文件路径和提交点均明确。
- 类型字段统一使用 `related_news`；词库字段统一使用 `category`、`place_origin`、`ages`、`industries`；后续任务不依赖未定义的函数名。
