import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { factoryFolderName, factoryImagePath, getFactoryImageDir, loadFactoryAdmin, saveFactoryAdmin, uniqueFactoryFilename } from '@/lib/factory-admin'
import { FACTORY_CATEGORIES, FACTORY_HUBS, FACTORY_SUPPLY_TYPES, isFactoryImage, type FactoryRecord, type FactorySupplyType } from '@/lib/factory-types'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'
const MAX_BYTES = 15 * 1024 * 1024

function jsonArray(form: FormData, key: string): string[] {
  try {
    const value = JSON.parse(String(form.get(key) || '[]'))
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: '无法解析上传数据' }, { status: 400 }) }
  const name = String(form.get('name') || '').trim()
  if (!name) return NextResponse.json({ error: '请填写供应链名称' }, { status: 400 })
  try {
    const admin = loadFactoryAdmin()
    const staticRecords = JSON.parse(readFileSync(join(process.cwd(), 'public', 'factory', 'factories.json'), 'utf8')) as FactoryRecord[]
    const maxId = Math.max(0, ...staticRecords.map(r => r.id), ...(admin.new_records || []).map(r => r.id))
    const id = maxId + 1
    const categories = jsonArray(form, 'categories').filter(v => [...FACTORY_CATEGORIES, ...(admin.config.custom_categories || [])].includes(v))
    const hub = String(form.get('hub') || '')
    const supplyTypes = jsonArray(form, 'supply_types').filter((v): v is FactorySupplyType => (FACTORY_SUPPLY_TYPES as readonly string[]).includes(v))
    const dirName = factoryFolderName(id, name)
    const dir = join(getFactoryImageDir(), dirName)
    mkdirSync(dir, { recursive: true })
    const images: { local: string }[] = []
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    for (const file of files) {
      if (!isFactoryImage(file.name) || file.size > MAX_BYTES) continue
      const filename = uniqueFactoryFilename('factory', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      images.push({ local: factoryImagePath(dirName, filename) })
    }
    const qrImages: string[] = []
    const qrFiles = form.getAll('qr_files').filter((f): f is File => f instanceof File)
    for (const file of qrFiles) {
      if (!isFactoryImage(file.name) || file.size > 10 * 1024 * 1024) continue
      const filename = uniqueFactoryFilename('qr', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      qrImages.push(factoryImagePath(dirName, filename))
    }
    const record: FactoryRecord = {
      id, name, images, one_line: String(form.get('one_line') || '').trim(), categories,
      hub: [...FACTORY_HUBS, ...(admin.config.custom_hubs || [])].includes(hub) ? hub : '',
      location: String(form.get('location') || '').trim(),
      own_brand: String(form.get('own_brand') || '') === 'true',
      verified: String(form.get('verified') || '') === 'true',
      supply_types: supplyTypes,
      ip_project_count: Math.max(0, Number(form.get('ip_project_count') || 0) || 0),
      qr_images: qrImages,
    }
    admin.new_records = [...(admin.new_records || []), record]
    saveFactoryAdmin(admin)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: `创建失败: ${(e as Error).message}` }, { status: 500 })
  }
}
