import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin, getIpbrandManualDir, uniqueFileName, IPBRAND_MANUAL_PREFIX } from '@/lib/ipbrand-admin'
import { isImageFileName } from '@/lib/ipbrand-types'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

const MAX_FILES = 50
const MAX_BYTES = 20 * 1024 * 1024 // 单文件 20MB（手册长图）

// 管理员：批量上传品牌手册图片（PDF 转图），存到手册目录并更新 manuals 元数据
// POST /api/admin/ipbrand/upload-manual  multipart: id, files[]
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

  const id = Number(String(form.get('id') || ''))
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '缺少有效的 IP 编号' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `单次最多上传 ${MAX_FILES} 张` }, { status: 400 })

  const dir = join(getIpbrandManualDir(), String(id))
  const saved: { name: string; url: string }[] = []
  try {
    mkdirSync(dir, { recursive: true })
    for (const file of files) {
      if (!isImageFileName(file.name)) {
        return NextResponse.json({ error: `不支持的文件类型: ${file.name}（仅 jpg/png/webp/gif）` }, { status: 400 })
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name} 超过 20MB` }, { status: 400 })
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const fileName = uniqueFileName('manual', file.name)
      writeFileSync(join(dir, fileName), buf)
      saved.push({ name: fileName, url: `${IPBRAND_MANUAL_PREFIX}${id}/${fileName}` })
    }

    const admin = loadIpBrandAdmin()
    const key = String(id)
    admin.manuals[key] = [...(admin.manuals[key] || []), ...saved]
    saveIpBrandAdmin(admin)

    return NextResponse.json({ ok: true, files: saved })
  } catch (e) {
    return NextResponse.json({ error: `上传失败: ${(e as Error).message}` }, { status: 500 })
  }
}
