// lib/ipbrand-admin.ts — IP品牌库管理员增量数据持久化（删除/编辑/品牌手册）
//
// 静态基线：public/ipbrand/ips.json（2014条，随 git 部署，不可写）
// 管理员增量：data/ipbrand-admin.json（部署时 data/ 持久化到 shared/data，不随 release 覆盖）
// 前端加载 ips.json + /api/ipbrand/overrides 合并渲染。
//
// 结构：
// {
//   "deleted": [id, ...],                          // 已删除的 IP id
//   "edits": { "640": { <IpRecord 字段覆盖> } },    // 每个 IP 的字段编辑（含自定义卡片）
//   "manuals": { "640": [{ name, url }, ...] }     // 每个 IP 的品牌手册图片（PDF 转图，仅展示不下载）
//   "new_records": [ <完整 IpRecord>, ... ]        // 管理员新增的 IP 记录
// }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { EMPTY_ADMIN, type IpBrandAdminData } from './ipbrand-types'

// 管理员增量数据文件（本地/生产都走 process.cwd()/data，生产 data 由 install-release symlink 到 shared/data）
function adminFilePath(): string {
  return resolve(process.cwd(), 'data', 'ipbrand-admin.json')
}

export function loadIpBrandAdmin(): IpBrandAdminData {
  const p = adminFilePath()
  if (!existsSync(p)) return structuredClone(EMPTY_ADMIN)
  try {
    const raw = readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
      edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {},
      manuals: parsed.manuals && typeof parsed.manuals === 'object' ? parsed.manuals : {},
      new_records: Array.isArray(parsed.new_records) ? parsed.new_records : [],
    }
  } catch {
    return structuredClone(EMPTY_ADMIN)
  }
}

export function saveIpBrandAdmin(data: IpBrandAdminData): void {
  const p = adminFilePath()
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
}

// 上传目录（本地 dev → public/，生产 → /srv/apps/ip-hot/shared/）
export function getIpbrandImageDir(): string {
  return process.env.IPBRAND_IMAGE_DIR || resolve(process.cwd(), 'public', 'ipbrand', 'images')
}
export function getIpbrandManualDir(): string {
  return process.env.IPBRAND_MANUAL_DIR || resolve(process.cwd(), 'public', 'ipbrand', 'manuals')
}

// 浏览器可访问前缀
export const IPBRAND_IMAGE_PREFIX = '/ipbrand/images/'
export const IPBRAND_MANUAL_PREFIX = '/ipbrand/manuals/'

// 从磁盘图片文件名生成相对 local（存回 edits.images），如 "images/640_名称/new_1.png"
export function imageLocalPath(ipFolderName: string, fileName: string): string {
  return `images/${ipFolderName}/${fileName}`
}

// 生成唯一文件名避免覆盖
export function uniqueFileName(prefix: string, originalName: string): string {
  const ext = (originalName.match(/\.([^.]+)$/) || [])[1] || 'jpg'
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}_${stamp}_${rand}.${ext.toLowerCase()}`
}

// 按 IP 名生成磁盘子目录名（与 ips.json 目录命名一致：{id}_{名称}）
export function ipFolderName(id: number, nameCn: string): string {
  // 去掉不能作文件名的字符（冒号/斜杠等），保留中文
  const safe = nameCn.replace(/[\\/:*?"<>|]/g, '')
  return `${id}_${safe || id}`
}
