import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { allPromptVersions } from '@/lib/prompts'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * 管理员查看：当前生效的提示词版本 + 各版本已处理的文章数。
 * 用途：换提示词后确认「新标准已生效、旧数据未被重算」。
 */
export async function GET(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const current = allPromptVersions()
    let usage: Array<{ prompt_version: string; articles: number; receipts: number }> = []
    try {
      const { rows } = await createServiceClient().query<{
        prompt_version: string
        articles: number
        receipts: number
      }>(
        `select v.prompt_version,
                (select count(*) from articles a where a.prompt_version = v.prompt_version) as articles,
                (select count(*) from llm_receipts r where r.prompt_version = v.prompt_version) as receipts
         from (
           select distinct prompt_version from articles where prompt_version is not null
           union
           select distinct prompt_version from llm_receipts where prompt_version is not null
         ) v
         order by v.prompt_version desc
         limit 20`,
      )
      usage = rows.map((r) => ({
        prompt_version: r.prompt_version,
        articles: Number(r.articles ?? 0),
        receipts: Number(r.receipts ?? 0),
      }))
    } catch (e) {
      // prompt_version 列可能尚未迁移：版本号照常返回，统计置空
      console.warn('[prompt-versions] 统计查询失败（迁移未执行？）:', e instanceof Error ? e.message : e)
    }
    return NextResponse.json({ current, usage })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
