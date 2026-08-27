// lib/licensee-admin.ts — 品牌方库服务端读写（node:fs，仅 API 路由使用）
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EMPTY_LICENSEE_ADMIN, type LicenseeAdminData } from './licensee-types'

const adminPath = () => resolve(process.cwd(), 'data', 'licensee-admin.json')

export function loadLicenseeAdmin(): LicenseeAdminData {
  if (!existsSync(adminPath())) return structuredClone(EMPTY_LICENSEE_ADMIN)
  try {
    const parsed = JSON.parse(readFileSync(adminPath(), 'utf8'))
    return {
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
      edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {},
      new_records: Array.isArray(parsed.new_records) ? parsed.new_records : [],
      config: {
        contact_public: parsed.config?.contact_public !== false,
        custom_hubs: Array.isArray(parsed.config?.custom_hubs) ? parsed.config.custom_hubs.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())) : [],
        custom_categories: Array.isArray(parsed.config?.custom_categories) ? parsed.config.custom_categories.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())) : [],
      },
    }
  } catch {
    return structuredClone(EMPTY_LICENSEE_ADMIN)
  }
}

export function saveLicenseeAdmin(data: LicenseeAdminData) {
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  writeFileSync(adminPath(), JSON.stringify(data, null, 2), 'utf8')
}

export function getLicenseeImageDir() {
  return process.env.LICENSEE_IMAGE_DIR || resolve(process.cwd(), 'public', 'licensee', 'images')
}

export const LICENSEE_IMAGE_PREFIX = '/licensee/images/'

export function licenseeImagePath(folder: string, filename: string) {
  return `images/${folder}/${filename}`
}

export function licenseeFolderName(id: number, name: string) {
  return `${id}_${name.replace(/[\\/:*?"<>|]/g, '') || id}`
}

export function uniqueLicenseeFilename(prefix: string, original: string) {
  const ext = (original.match(/\.([^.]+)$/) || [])[1] || 'jpg'
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}.${ext.toLowerCase()}`
}

export function deleteLicenseeFile(folder: string, filename: string) {
  const path = join(getLicenseeImageDir(), folder, filename)
  if (existsSync(path)) unlinkSync(path)
}
