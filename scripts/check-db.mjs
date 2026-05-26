import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(fp) {
  if (!existsSync(fp)) return
  const content = readFileSync(fp, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
}
loadEnvFile(resolve(process.cwd(), '.env.local'))

const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || ''

async function check() {
  for (const source of ['三文娱', '游民星空动漫', '17173动漫']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=source,title,title_cn,summary_cn,category,relevance_score,is_selected&source=eq.${encodeURIComponent(source)}&limit=10`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    })
    const data = await res.json()
    console.log(`\n${source} 记录 (${data.length}条):`)
    for (const row of data) {
      console.log(`  - [${row.category}] ${row.title_cn?.slice(0,30) || row.title?.slice(0,30)} (score=${row.relevance_score}, selected=${row.is_selected})`)
    }
  }
}
check().catch(e => console.log('err:', e.message))
