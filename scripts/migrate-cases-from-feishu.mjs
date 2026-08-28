#!/usr/bin/env node
// scripts/migrate-cases-from-feishu.mjs — 飞书《IP授权案例》表 → 网站案例库 cases.json 一次性迁移
//
// 用法（项目根目录）：
//   node scripts/migrate-cases-from-feishu.mjs              # 全量迁移（已迁移的记录按映射表原位更新）
//   node scripts/migrate-cases-from-feishu.mjs --no-images  # 跳过图片下载（快速预览数据）
//   node scripts/migrate-cases-from-feishu.mjs --dry-run    # 只输出筛选统计，不写文件
//
// 规则见 plan：优质筛选（互动≥50 或 有图+描述≥20字 或 白名单）、4分类映射、三方按名匹配建档。
// 重复运行安全：scripts/case-migration-map.json 记录 飞书record_id → 案例id，已迁移记录原位更新不重复入库。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE_TOKEN = 'XXgHbFZtxa4s3Asj0yMcxwtpnHg'
const TABLE_ID = 'tbln3F5QuTCt5mHI'
const CASES_JSON = join(ROOT, 'public', 'case', 'cases.json')
const MAP_FILE = join(ROOT, 'scripts', 'case-migration-map.json')
const WHITELIST_FILE = join(ROOT, 'scripts', 'case-migration-whitelist.json')
const UNMATCHED_CSV = join(ROOT, 'scripts', 'output', 'unmatched-licensees.csv')
const IMAGE_ROOT = join(ROOT, 'public', 'case', 'images')
const PAGE_SIZE = 200
const MAX_IMAGES_PER_CASE = 3

const DRY_RUN = process.argv.includes('--dry-run')
const NO_IMAGES = process.argv.includes('--dry-run') || process.argv.includes('--no-images')

// ---------- 词表（与 lib/case-types.ts 保持一致） ----------
const CASE_PRODUCT_CATEGORIES = new Set([
  '毛绒', '盲盒', 'PVC手办', '徽章', '亚克力', '树脂', '软胶', '木制',
  '服装', '杯壶', '文具', '电子配件', '食品', '饮料', '日化', '美妆',
  '家居', '宠物用品', '母婴', '图书出版',
  '美陈', '快闪', '儿童业态', '主题展', '主题餐饮', '沉浸式空间',
])
const SOFT_LINE = new Set(['毛绒', '服装', '杯壶', '文具', '日化', '美妆', '食品', '饮料', '家居', '宠物用品', '母婴', '图书出版', '软胶', '木制'])
const HARD_LINE = new Set(['盲盒', 'PVC手办', '徽章', '亚克力', '树脂', '电子配件'])
const LBE_TYPES = new Set(['商场快闪', 'IP美陈', '中庭儿童乐园'])

// ---------- 小工具 ----------
// Windows 上 lark-cli 是 .cmd 批处理，execFile 需 shell:true 才能拉起
function lark(args) {
  const out = execFileSync('lark-cli', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true })
  return JSON.parse(out)
}
const text = v => {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(text).join(' ').trim()
  if (typeof v === 'object') return String(v.text ?? v.name ?? v.link ?? '').trim()
  return String(v).trim()
}
const num = v => Math.max(0, Number(v) || 0)
// 飞书 url 字段有时是 markdown 包裹：[url](url)
const unwrapUrl = v => {
  const s = text(v)
  const m = s.match(/\((https?:\/\/[^)]+)\)/)
  return m ? m[1] : s
}
const normName = s => text(s).toLowerCase().replace(/[\s·・・]/g, '')
const BAD_VALUES = new Set(['未明确', '待定', '暂无', '未知', '无'])
const cleanText = v => BAD_VALUES.has(text(v)) ? '' : text(v)
const folderName = (id, name) => `${id}_${String(name || id).replace(/[\\/:*?"<>|]/g, '')}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- 1. 拉取全量记录 ----------
async function fetchAllRecords() {
  const rows = []
  let offset = 0
  for (;;) {
    const res = lark(['base', '+record-list', '--base-token', BASE_TOKEN, '--table-id', TABLE_ID, '--format', 'json', '--limit', String(PAGE_SIZE), '--offset', String(offset)])
    const d = res.data || {}
    const fields = d.fields || []
    const ids = d.record_id_list || []
    ;(d.data || []).forEach((row, i) => {
      const rec = { _record_id: ids[i] || '' }
      fields.forEach((name, col) => { rec[name] = row[col] })
      rows.push(rec)
    })
    console.log(`  拉取 ${offset + 1} ~ ${offset + (d.data || []).length} 条`)
    if (!d.has_more || !(d.data || []).length) break
    offset += PAGE_SIZE
  }
  return rows
}

// ---------- 2. 三库名称索引（只匹配可见记录：合并增量并排除已删除） ----------
function loadJsonSafe(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}
function buildPartyIndex() {
  const ips = loadJsonSafe(join(ROOT, 'public', 'ipbrand', 'ips.json'), [])
  const licensees = loadJsonSafe(join(ROOT, 'public', 'licensee', 'licensees.json'), [])
  const licenseeAdmin = loadJsonSafe(join(ROOT, 'data', 'licensee-admin.json'), { deleted: [], new_records: [] })
  const factories = loadJsonSafe(join(ROOT, 'public', 'factory', 'factories.json'), [])
  const factoryAdmin = loadJsonSafe(join(ROOT, 'data', 'supplychain-admin.json'), { deleted: [], new_records: [] })

  const visible = (records, admin) => {
    const deleted = new Set(admin.deleted || [])
    return [...records, ...(admin.new_records || [])].filter(r => !deleted.has(r.id))
  }
  const ipIndex = new Map()
  for (const ip of ips) {
    if (ip.name_cn) ipIndex.set(normName(ip.name_cn), ip.id)
    if (ip.name_en) ipIndex.set(normName(ip.name_en), ip.id)
  }
  const licenseeIndex = new Map()
  for (const item of visible(licensees, licenseeAdmin)) if (item.name) licenseeIndex.set(normName(item.name), item.id)
  const factoryIndex = new Map()
  for (const item of visible(factories, factoryAdmin)) if (item.name) factoryIndex.set(normName(item.name), item.id)
  console.log(`三方索引：IP ${ipIndex.size} 个名字、品牌方 ${licenseeIndex.size}、工厂 ${factoryIndex.size}`)
  return { ipIndex, licenseeIndex, factoryIndex }
}

// ---------- 3. 筛选与映射 ----------
function passQuality(rec, whitelist) {
  if (whitelist.has(rec._record_id)) return true
  const engagement = num(rec['点赞数']) + num(rec['收藏数']) + num(rec['评论数'])
  if (engagement >= 50) return true
  const hasImages = Array.isArray(rec['产品图片']) && rec['产品图片'].length > 0
  const descLen = text(rec['笔记内容']).length
  if (hasImages && descLen >= 20) return true
  return false
}

function mapLicenseKind(rec) {
  const caseType = text(rec['案例类型'])
  if (LBE_TYPES.has(caseType)) return 'LBE主题授权'
  const licenseWay = text(rec['授权方式'])
  if (/联名|独家|跨界|品牌合作|促销/.test(licenseWay)) return '促销授权'
  if (/主题|空间|美陈|快闪/.test(licenseWay)) return 'LBE主题授权'
  const category = text(rec['授权品类'])
  if (HARD_LINE.has(category)) return '商品化授权/硬线'
  if (SOFT_LINE.has(category)) return '商品化授权/软线'
  return '商品化授权/软线' // 兜底
}

function mapCategory(rec) {
  const raw = cleanText(rec['授权品类'])
  if (CASE_PRODUCT_CATEGORIES.has(raw)) return raw
  // 常见别名归一
  const alias = { '潮玩': '盲盒', '手办': 'PVC手办', '谷子': '徽章', '卡牌': '徽章', '展览': '主题展', '展会': '主题展', '乐园': '儿童业态' }
  for (const [k, v] of Object.entries(alias)) if (raw.includes(k)) return v
  return raw // 未识别保留原文（后续 admin 可改）
}

function mapDate(rec) {
  const raw = cleanText(rec['授权项目开始时间'])
  const m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  const published = cleanText(rec['笔记发布时间'])
  const m2 = published.match(/(\d{4})-(\d{1,2})/)
  return m2 ? `${m2[1]}-${m2[2].padStart(2, '0')}` : ''
}

// ---------- 4. 图片下载 ----------
function downloadImages(caseId, ipName, attachments) {
  const tokens = (attachments || []).filter(a => a && a.file_token).slice(0, MAX_IMAGES_PER_CASE)
  if (!tokens.length) return []
  const folder = folderName(caseId, ipName)
  const dir = join(IMAGE_ROOT, folder)
  mkdirSync(dir, { recursive: true })
  // lark-cli 安全限制：--output 必须是当前目录内的相对路径，cwd 固定为项目根
  const relDir = `public/case/images/${folder}`
  try {
    execFileSync('lark-cli', ['base', '+record-download-attachment',
      '--base-token', BASE_TOKEN, '--table-id', TABLE_ID,
      '--record-id', tokens[0]._record_id,
      ...tokens.flatMap(a => ['--file-token', a.file_token]),
      '--output', relDir, '--overwrite',
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: true, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    console.log(`    ⚠ 案例 ${caseId} 图片下载失败：${String(e.message).slice(0, 200)}`)
  }
  return readdirSync(dir)
    .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .sort()
    .slice(0, MAX_IMAGES_PER_CASE)
    .map(f => ({ local: `images/${folder}/${f}` }))
}

// ---------- 主流程 ----------
async function main() {
  console.log('== 阶段1/4 拉取飞书记录 ==')
  const records = await fetchAllRecords()
  console.log(`共 ${records.length} 条`)

  console.log('== 阶段2/4 加载三方索引与映射表 ==')
  const { ipIndex, licenseeIndex } = buildPartyIndex()
  const migrateMap = loadJsonSafe(MAP_FILE, {})
  const whitelist = new Set(loadJsonSafe(WHITELIST_FILE, []))
  const existing = loadJsonSafe(CASES_JSON, [])
  const demoRecords = existing.filter(r => !Object.values(migrateMap).includes(r.id))
  // 已下载过的图片按案例 id 保留，--no-images 重跑不丢图
  const prevImagesById = new Map(existing.map(r => [r.id, r.images || []]))
  let nextId = Math.max(0, ...existing.map(r => r.id)) + 1

  console.log('== 阶段3/4 筛选 + 映射 ==')
  const stats = { total: records.length, invalid: 0, lowQuality: 0, migrated: 0, kinds: {}, withImages: 0, ipLinked: 0, licenseeLinked: 0 }
  const unmatchedLicensees = new Map()
  const out = [...demoRecords]

  for (const rec of records) {
    const ipName = cleanText(rec['IP/品牌名称'])
    const licenseeName = cleanText(rec['授权合作品牌'])
    // IP 名是案例库的核心视角：IP 名为空的记录（多为只登记了商场的笔记）不入库
    if (!ipName) { stats.invalid++; continue }
    if (!passQuality(rec, whitelist)) { stats.lowQuality++; continue }

    const kind = mapLicenseKind(rec)
    stats.kinds[kind] = (stats.kinds[kind] || 0) + 1

    const ipId = ipIndex.get(normName(ipName)) || 0
    const licenseeId = licenseeIndex.get(normName(licenseeName)) || 0
    if (ipId) stats.ipLinked++
    if (licenseeId) stats.licenseeLinked++
    else if (licenseeName) unmatchedLicensees.set(licenseeName, (unmatchedLicensees.get(licenseeName) || 0) + 1)

    const id = migrateMap[rec._record_id] || nextId++
    migrateMap[rec._record_id] = id

    const noteUrl = unwrapUrl(rec['笔记链接'])
    const desc = text(rec['笔记内容'])
    const sales = text(rec['销售成绩描述'])
    const attachments = (Array.isArray(rec['产品图片']) ? rec['产品图片'] : []).map(a => ({ ...a, _record_id: rec._record_id }))

    const record = {
      id,
      ip_id: ipId,
      ip_name: ipName,
      licensee_id: licenseeId,
      licensee_name: licenseeName,
      factory_id: 0,
      factory_name: '',
      images: [],
      license_kind: kind,
      product_category: mapCategory(rec),
      city: cleanText(rec['城市']),
      case_date: mapDate(rec),
      description: sales ? `${desc}\n\n销售成绩：${sales}`.trim() : desc,
      source_url: unwrapUrl(rec['信息来源网址']),
      social: noteUrl ? {
        note_url: noteUrl,
        note_title: text(rec['笔记标题']),
        note_published: cleanText(rec['笔记发布时间']),
        like_count: num(rec['点赞数']),
        collect_count: num(rec['收藏数']),
        comment_count: num(rec['评论数']),
      } : null,
      analysis_blocks: [],
      promo_timeline: [],
      gated: false,
    }

    if (!DRY_RUN && !NO_IMAGES && attachments.length) {
      record.images = downloadImages(id, ipName || licenseeName, attachments)
      if (record.images.length) stats.withImages++
      await sleep(300) // 温柔一点，避免打爆飞书接口
    }
    if (!record.images.length && prevImagesById.get(id)?.length) record.images = prevImagesById.get(id)
    out.push(record)
    stats.migrated++
    if (stats.migrated % 50 === 0) console.log(`  已处理 ${stats.migrated} 条…`)
  }

  // 最新在前；日期空按互动数兜底
  out.sort((a, b) => (b.case_date || '').localeCompare(a.case_date || '') || ((b.social?.like_count || 0) - (a.social?.like_count || 0)))

  console.log('== 阶段4/4 写出 ==')
  if (!DRY_RUN) {
    writeFileSync(CASES_JSON, JSON.stringify(out, null, 2), 'utf8')
    writeFileSync(MAP_FILE, JSON.stringify(migrateMap, null, 2), 'utf8')
    mkdirSync(dirname(UNMATCHED_CSV), { recursive: true })
    const csv = ['品牌方名称,出现次数', ...[...unmatchedLicensees.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `"${n}",${c}`)]
    writeFileSync(UNMATCHED_CSV, '﻿' + csv.join('\n'), 'utf8')
  }

  console.log('\n===== 迁移统计 =====')
  console.log(`飞书总记录: ${stats.total}`)
  console.log(`无效(双空)丢弃: ${stats.invalid}`)
  console.log(`质量不达标跳过: ${stats.lowQuality}`)
  console.log(`入库案例: ${stats.migrated}（含演示 ${demoRecords.length} 条，cases.json 总计 ${out.length} 条）`)
  console.log(`分类分布: ${JSON.stringify(stats.kinds)}`)
  console.log(`IP 硬链命中: ${stats.ipLinked} / 品牌方硬链命中: ${stats.licenseeLinked}`)
  if (!NO_IMAGES) console.log(`下载到图片的案例: ${stats.withImages}`)
  console.log(`未匹配品牌方名单: ${UNMATCHED_CSV}（${unmatchedLicensees.size} 个）`)
}

main().catch(e => { console.error('迁移失败:', e); process.exit(1) })
