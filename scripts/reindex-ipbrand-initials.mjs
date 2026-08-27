// scripts/reindex-ipbrand-initials.mjs — IP品牌库一次性数据重排
//
// 用途：把所有 IP 名称去掉书名号族字符，并按中文/英文名重算拼音首字母 `initial`。
// 用法：
//   node scripts/reindex-ipbrand-initials.mjs public/ipbrand/ips.json
//   node scripts/reindex-ipbrand-initials.mjs data/ipbrand-admin.json
// 也适用于服务器上的 shared/data/ipbrand-admin.json（先备份再跑）。
//
// 说明：脚本内联了与 lib/pinyin-initial.ts 相同的规则（normalizeIpName / pinyinInitial），
// 避免在纯 .mjs 里引入 .ts 依赖；若以后规则变更，需两处同步。
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { pinyin } from 'pinyin-pro'

const CJK_BRACKET_RE = /[《》〈〉「」『』【】〔〕]/g
const LEADING_JUNK_RE = /^[\s"'“”‘’《》〈〉「」『』【】〔〕：:·．\-–—，,、]+/

// 与 lib/pinyin-initial.ts 保持一致的多音字修正
const CHAR_INITIAL_OVERRIDE = { '嚣': 'X', '耙': 'B' }

function normalizeIpName(name) {
  return (name || '').replace(CJK_BRACKET_RE, '').trim()
}

function pinyinInitial(name) {
  const s = (name || '').replace(LEADING_JUNK_RE, '').trim()
  const c = s.charAt(0)
  if (!c) return '#'
  if (/[a-zA-Z]/.test(c)) return c.toUpperCase()
  if (/[0-9]/.test(c)) return '#'
  const override = CHAR_INITIAL_OVERRIDE[c]
  if (override) return override
  let first = ''
  try {
    const out = pinyin(c, { pattern: 'first', toneType: 'none', type: 'array' })
    first = Array.isArray(out) ? String(out[0] || '') : String(out).charAt(0)
  } catch {
    first = ''
  }
  const m = /[a-zA-Z]/.exec(first)
  return m ? m[0].toUpperCase() : '#'
}

function reindexRecord(r) {
  const hasCn = typeof r.name_cn === 'string' && r.name_cn.trim() !== ''
  const sourceName = hasCn ? r.name_cn : String(r.name_en || '')
  const newName = normalizeIpName(typeof r.name_cn === 'string' ? r.name_cn : '')
  const initial = pinyinInitial(sourceName)
  let changed = 0
  if (newName !== r.name_cn) { r.name_cn = newName; changed++ }
  if (initial !== r.initial) { r.initial = initial; changed++ }
  return changed > 0
}

function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('用法: node scripts/reindex-ipbrand-initials.mjs <json文件路径>')
    process.exit(1)
  }

  const rawText = readFileSync(target, 'utf8')
  const raw = JSON.parse(rawText)
  let changed = 0

  if (Array.isArray(raw)) {
    for (const r of raw) if (reindexRecord(r)) changed++
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.new_records)) for (const r of raw.new_records) if (reindexRecord(r)) changed++
    if (raw.edits && typeof raw.edits === 'object') {
      for (const id of Object.keys(raw.edits)) {
        const e = raw.edits[id]
        if (e && typeof e === 'object' && typeof e.name_cn === 'string') {
          const newName = normalizeIpName(e.name_cn)
          const initial = pinyinInitial(newName)
          let c = 0
          if (newName !== e.name_cn) { e.name_cn = newName; c++ }
          if (initial !== e.initial) { e.initial = initial; c++ }
          if (c) { changed++; }
        }
      }
    }
  } else {
    console.error(`无法识别的 JSON 结构: ${target}`)
    process.exit(1)
  }

  // 保留原文件缩进风格（ipbrand-admin.json 是 2 空格缩进，ips.json 是紧凑单行）
  const pretty = /^[{[]\s*\n/.test(rawText)
  const hadTrailingNL = /\n\s*$/.test(rawText)
  let out = pretty ? JSON.stringify(raw, null, 2) : JSON.stringify(raw)
  if (hadTrailingNL && !out.endsWith('\n')) out += '\n'
  else if (!hadTrailingNL && out.endsWith('\n')) out = out.slice(0, -1)

  const tmp = `${target}.tmp.${process.pid}`
  writeFileSync(tmp, out, 'utf8')
  renameSync(tmp, target)
  console.log(`完成: ${target}（改写 ${changed} 条）`)
}

main()