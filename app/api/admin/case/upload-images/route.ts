import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { caseFolderName, caseImagePath, getCaseImageDir, uniqueCaseFilename } from '@/lib/case-admin'
import { isCaseImage } from '@/lib/case-types'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'
const MAX_FILES = 30
const MAX_BYTES = 15 * 1024 * 1024

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: '无法解析上传数据' }, { status: 400 }) }
  const id = Number(String(form.get('id') || ''))
  const name = String(form.get('name') || '').trim()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!Number.isInteger(id) || id <= 0 || !name) return NextResponse.json({ error: '缺少有效编号或名称' }, { status: 400 })
  if (files.length === 0) return NextResponse.json({ error: '未选择文件' }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json({ error: `单次最多上传 ${MAX_FILES} 张` }, { status: 400 })
  try {
    const folder = caseFolderName(id, name)
    const dir = join(getCaseImageDir(), folder)
    mkdirSync(dir, { recursive: true })
    const saved: { local: string }[] = []
    for (const file of files) {
      if (!isCaseImage(file.name)) return NextResponse.json({ error: `不支持的文件类型: ${file.name}` }, { status: 400 })
      if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name} 超过 15MB` }, { status: 400 })
      const filename = uniqueCaseFilename('case', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      saved.push({ local: caseImagePath(folder, filename) })
    }
    return NextResponse.json({ ok: true, files: saved })
  } catch (e) {
    return NextResponse.json({ error: `上传失败: ${(e as Error).message}` }, { status: 500 })
  }
}
