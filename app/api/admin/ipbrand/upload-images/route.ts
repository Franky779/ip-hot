import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { getIpbrandImageDir, ipFolderName, uniqueFileName, imageLocalPath } from '@/lib/ipbrand-admin'
import { isImageFileName } from '@/lib/ipbrand-types'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

const MAX_FILES = 20
const MAX_BYTES = 15 * 1024 * 1024 // 单文件 15MB

// 管理员：批量上传对外展示图/授权案例图到 IP 图片目录（不写数据，前端并入 images 后走 save-edit）
// POST /api/admin/ipbrand/upload-images  multipart: id, name_cn, files[]
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
  const nameCn = String(form.get('name_cn') || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !nameCn) {
    return NextResponse.json({ error: '缺少有效的 IP 编号或名称' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `单次最多上传 ${MAX_FILES} 张` }, { status: 400 })

  const folder = ipFolderName(id, nameCn)
  const dir = join(getIpbrandImageDir(), folder)

  const saved: { name: string; local: string }[] = []
  try {
    mkdirSync(dir, { recursive: true })
    for (const file of files) {
      if (!isImageFileName(file.name)) {
        return NextResponse.json({ error: `不支持的文件类型: ${file.name}（仅 jpg/png/webp/gif）` }, { status: 400 })
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name} 超过 15MB` }, { status: 400 })
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const fileName = uniqueFileName('up', file.name)
      writeFileSync(join(dir, fileName), buf)
      saved.push({ name: fileName, local: imageLocalPath(folder, fileName) })
    }
    return NextResponse.json({ ok: true, files: saved })
  } catch (e) {
    return NextResponse.json({ error: `上传失败: ${(e as Error).message}` }, { status: 500 })
  }
}
