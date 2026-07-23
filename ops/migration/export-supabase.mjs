import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const TABLES = [
  'articles',
  'info_sources',
  'cron_logs',
  'source_fetch_runs',
  'classification_learnings',
  'pipeline_state',
  'daily_reports',
  'changelogs',
]

function parseEnv(content) {
  const values = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const name = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

async function exportTable(baseUrl, apiKey, table) {
  const rows = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const headers = {
      apikey: apiKey,
      Range: `${offset}-${offset + pageSize - 1}`,
      Prefer: 'count=exact',
    }
    if (apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${apiKey}`
    const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*`, { headers })
    if (!response.ok) {
      throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`)
    }
    const page = await response.json()
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

const envPath = resolve(process.argv[2] || '.env.source.local')
const outputDir = resolve(process.argv[3] || 'migration-data')
const env = { ...parseEnv(await readFile(envPath, 'utf8')), ...process.env }
const baseUrl = (env.SUPABASE_SOURCE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const apiKey = env.SUPABASE_SOURCE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || ''

if (!baseUrl || !apiKey) {
  throw new Error('Source Supabase URL or secret key is missing')
}

await mkdir(outputDir, { recursive: true })
const summary = {}
for (const table of TABLES) {
  try {
    const rows = await exportTable(baseUrl, apiKey, table)
    await writeFile(resolve(outputDir, `${table}.json`), JSON.stringify(rows), 'utf8')
    summary[table] = { count: rows.length, exported: true }
    console.log(`${table}: ${rows.length}`)
  } catch (error) {
    await writeFile(resolve(outputDir, `${table}.json`), '[]', 'utf8')
    summary[table] = { count: 0, exported: false, error: error.message }
    console.error(error.message)
  }
}

await writeFile(resolve(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
if (Object.values(summary).some((item) => !item.exported)) process.exitCode = 2
