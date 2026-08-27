// lib/pinyin-initial.ts — IP品牌库中文名→拼音首字母工具（前后端共用）
//
// 规则：`initial` 永远由当前中文名实时推导，名称写入时自动去掉书名号。
// —— 中文名按拼音首字母归组（怪→G）；英文名取首字母大写；数字/符号/非中日韩字符归 `#`。
import { pinyin } from 'pinyin-pro'
import type { IpRecord } from './ipbrand-types.ts'

// 书名号族字符（发布名排印用，不是名称内容的一部分，一律去掉）
const CJK_BRACKET_RE = /[《》〈〉「」『』【】〔〕]/g

// 首字母判定前要去掉的"开头噪声"：空白、书名号、引号、冒号、连接符等
const LEADING_JUNK_RE = /^[\s"'“”‘’《》〈〉「」『』【】〔〕：:·．\-–—，,、]+/

// 个别字符 pinyin-pro 单字读音与主流字典/名称语感不符（多音字），此处以实际读音覆盖
const CHAR_INITIAL_OVERRIDE: Record<string, string> = {
  嚣: 'X', // xiāo（叫嚣/喧嚣）；pinyin-pro 误读为 áo
  耙: 'B', // bà（耙子/农具）；pinyin-pro 取 pá
}

/** 去掉名称中的全部书名号族字符（名称存储/展示层用） */
export function normalizeIpName(name: string): string {
  return (name || '').replace(CJK_BRACKET_RE, '').trim()
}

/** 计算名称的拼音首字母：英文取大写，数字/符号/无法转拼音取 `#` */
export function pinyinInitial(name: string): string {
  const s = (name || '').replace(LEADING_JUNK_RE, '').trim()
  const c = s.charAt(0)
  if (!c) return '#'
  if (/[a-zA-Z]/.test(c)) return c.toUpperCase()
  if (/[0-9]/.test(c)) return '#'
  const override = CHAR_INITIAL_OVERRIDE[c]
  if (override) return override

  // 中文等字符走 pinyin-pro 取首音节首字母
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

/** 渲染期兜底：逐条重算 initial，保证列表筛选用到的首字母永远与当前名称一致 */
export function deriveIpInitials(records: IpRecord[]): IpRecord[] {
  return records.map(r => {
    const initial = pinyinInitial(r.name_cn || r.name_en || '')
    return initial === (r.initial || '#') ? r : { ...r, initial }
  })
}