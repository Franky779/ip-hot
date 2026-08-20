import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EMPTY_FACTORY_ADMIN, type FactoryAdminData } from './factory-types'

const adminPath = () => resolve(process.cwd(), 'data', 'supplychain-admin.json')

export function loadFactoryAdmin(): FactoryAdminData {
  if (!existsSync(adminPath())) return structuredClone(EMPTY_FACTORY_ADMIN)
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
    return structuredClone(EMPTY_FACTORY_ADMIN)
  }
}

export function saveFactoryAdmin(data: FactoryAdminData) {
  mkdirSync(resolve(process.cwd(), 'data'), { recursive: true })
  writeFileSync(adminPath(), JSON.stringify(data, null, 2), 'utf8')
}

export function getFactoryImageDir() {
  return process.env.FACTORY_IMAGE_DIR || resolve(process.cwd(), 'public', 'factory', 'images')
}

export const FACTORY_IMAGE_PREFIX = '/factory/images/'

export function factoryImagePath(folder: string, filename: string) {
  return `images/${folder}/${filename}`
}

export function factoryFolderName(id: number, name: string) {
  return `${id}_${name.replace(/[\\/:*?"<>|]/g, '') || id}`
}

export function uniqueFactoryFilename(prefix: string, original: string) {
  const ext = (original.match(/\.([^.]+)$/) || [])[1] || 'jpg'
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}.${ext.toLowerCase()}`
}

export function deleteFactoryFile(folder: string, filename: string) {
  const path = join(getFactoryImageDir(), folder, filename)
  if (existsSync(path)) unlinkSync(path)
}
