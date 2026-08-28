// lib/case-admin.ts — IP授权案例库服务端读写（node:fs，仅 API 路由使用）
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EMPTY_CASE_ADMIN, type CaseAdminData } from './case-types'

const adminPath = () => resolve(process.cwd(), 'data', 'case-admin.json')

export function loadCaseAdmin(): CaseAdminData {
  if (!existsSync(adminPath())) return structuredClone(EMPTY_CASE_ADMIN)
  try {
    const parsed = JSON.parse(readFileSync(adminPath(), 'utf8'))
    return {
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
      edits: parsed.edits && typeof parsed.edits === 'object' ? parsed.edits : {},
      new_records: Array.isArray(parsed.new_records) ? parsed.new_records : [],
      config: {
        custom_categories: Array.isArray(parsed.config?.custom_categories) ? parsed.config.custom_categories.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())) : [],
        custom_cities: Array.isArray(parsed.config?.custom_cities) ? parsed.config.custom_cities.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())) : [],
      },
    }
  } catch {
    return structuredClone(EMPTY_CASE_ADMIN)
  }
}

export function saveCaseAdmin(data: CaseAdminData) {
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  writeFileSync(adminPath(), JSON.stringify(data, null, 2), 'utf8')
}

export function getCaseImageDir() {
  return process.env.CASE_IMAGE_DIR || resolve(process.cwd(), 'public', 'case', 'images')
}

export const CASE_IMAGE_PREFIX = '/case/images/'

export function caseImagePath(folder: string, filename: string) {
  return `images/${folder}/${filename}`
}

export function caseFolderName(id: number, name: string) {
  return `${id}_${name.replace(/[\\/:*?"<>|]/g, '') || id}`
}

export function uniqueCaseFilename(prefix: string, original: string) {
  const ext = (original.match(/\.([^.]+)$/) || [])[1] || 'jpg'
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}.${ext.toLowerCase()}`
}

export function deleteCaseFile(folder: string, filename: string) {
  const path = join(getCaseImageDir(), folder, filename)
  if (existsSync(path)) unlinkSync(path)
}
