import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin, getIpbrandImageDir, ipFolderName, uniqueFileName, imageLocalPath } from '@/lib/ipbrand-admin'
import { isImageFileName, type IpRecord, type IpCase } from '@/lib/ipbrand-types'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 15 * 1024 * 1024 // 单文件 15MB

// 管理员：新建一个 IP 记录（分配新 id，写封面/展示图，存入 admin.new_records）
// POST /api/admin/ipbrand/create  multipart: name_cn 等文本字段 + cover 文件 + files[] 展示图 + cases(JSON)
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: '无法解析上传数据' }, { status: 400 })
  }

  const nameCn = String(form.get('name_cn') || '').trim()
  if (!nameCn) {
    return NextResponse.json({ error: '缺少 IP 名称' }, { status: 400 })
  }

  try {
    const admin = loadIpBrandAdmin()

    // 分配新 id：静态库最大 id 与已新增记录最大 id 取大 + 1
    const staticRecs = JSON.parse(readFileSync(join(process.cwd(), 'public', 'ipbrand', 'ips.json'), 'utf8')) as IpRecord[]
    const maxStatic = staticRecs.reduce((m, r) => Math.max(m, r.id), 0)
    const maxNew = (admin.new_records || []).reduce((m, r) => Math.max(m, r.id), 0)
    const newId = Math.max(maxStatic, maxNew) + 1

    // 写封面 + 展示图到 images/{id}_{name}/
    const folder = ipFolderName(newId, nameCn)
    const dir = join(getIpbrandImageDir(), folder)
    mkdirSync(dir, { recursive: true })

    let cover = ''
    const images: { type: string; local: string }[] = []
    const coverFile = form.get('cover')
    if (coverFile instanceof File && isImageFileName(coverFile.name) && coverFile.size <= MAX_BYTES) {
      const fn = uniqueFileName('cover', coverFile.name)
      writeFileSync(join(dir, fn), Buffer.from(await coverFile.arrayBuffer()))
      cover = imageLocalPath(folder, fn)
    }
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    for (const file of files) {
      if (!isImageFileName(file.name) || file.size > MAX_BYTES) continue
      const fn = uniqueFileName('up', file.name)
      writeFileSync(join(dir, fn), Buffer.from(await file.arrayBuffer()))
      images.push({ type: 'gallery', local: imageLocalPath(folder, fn) })
    }

    // 文本字段
    const str = (k: string) => String(form.get(k) || '').trim()
    const arr = (k: string): string[] => {
      try {
        const v = JSON.parse(String(form.get(k) || '[]'))
        return Array.isArray(v) ? v.filter((x: unknown) => typeof x === 'string') : []
      } catch {
        return []
      }
    }
    const cases = arr('cases') as unknown as IpCase[]

    const record: IpRecord = {
      id: newId,
      name_cn: nameCn,
      name_en: str('name_en'),
      initial: str('initial') || '#',
      cover,
      images,
      case_len: cases.length,
      category: str('category'),
      place_origin: str('place_origin'),
      company: str('company'),
      one_line_intro: str('one_line_intro'),
      ip_intro: str('ip_intro'),
      company_intro: str('company_intro'),
      areas: arr('areas'),
      ages: arr('ages'),
      industries: arr('industries'),
      listing_date: str('listing_date'),
      auth_start: str('auth_start'),
      auth_end: str('auth_end'),
      licensor_case_list: cases,
      news_list: [],
      source_url: '',
    }

    admin.new_records = [...(admin.new_records || []), record]
    saveIpBrandAdmin(admin)

    return NextResponse.json({ ok: true, id: newId })
  } catch (e) {
    return NextResponse.json({ error: `创建失败: ${(e as Error).message}` }, { status: 500 })
  }
}
