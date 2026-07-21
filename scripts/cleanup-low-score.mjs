// 一次性清理脚本：删除待分类中 0-3 分的历史噪音文章
// 用法：node scripts/cleanup-low-score.mjs [--dry-run]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectDir = join(__dirname, '..')

function readEnvValue(path, name) {
  const content = readFileSync(path, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...rest] = trimmed.split('=')
    if (key.trim() === name) {
      return rest.join('=').trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return null
}

const url = readEnvValue(join(projectDir, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL')
const key = readEnvValue(join(projectDir, '.env.local'), 'SUPABASE_SECRET_KEY')

if (!url || !key) {
  console.error('缺少 SUPABASE_SECRET_KEY 或 NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// 保留最近 12 小时，避免误删刚抓取但还没处理完的文章
const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

async function main() {
  // 先查询将要删除的数量
  const { count, error: countError } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('category', '待分类')
    .lte('relevance_score', 3)
    .lt('created_at', twelveHoursAgo)

  if (countError) {
    console.error('查询失败:', countError.message)
    process.exit(1)
  }

  console.log(`待删除记录数: ${count}`)

  if (dryRun) {
    console.log('这是演习（--dry-run），不会真正删除。')
    return
  }

  if (count === 0) {
    console.log('没有需要删除的记录。')
    return
  }

  const { error, count: deletedCount } = await supabase
    .from('articles')
    .delete({ count: 'exact' })
    .eq('category', '待分类')
    .lte('relevance_score', 3)
    .lt('created_at', twelveHoursAgo)

  if (error) {
    console.error('删除失败:', error.message)
    process.exit(1)
  }

  console.log(`已删除 ${deletedCount} 条记录。`)
}

main().catch((err) => {
  console.error('未捕获异常:', err.message)
  process.exit(1)
})
