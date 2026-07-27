import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const root = resolve(process.cwd())
const reports = JSON.parse(await readFile(resolve(root, 'ops/migration/research-reports.json'), 'utf8'))
const schema = await readFile(resolve(root, 'ops/postgres/schema.sql'), 'utf8')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

try {
  await pool.query(schema)
  for (const report of reports) {
    await pool.query(`
      insert into research_reports (slug, category, title, published_at, markdown_content, github_backup_status)
      values ($1, $2, $3, $4, $5, 'pending')
      on conflict (slug) do update set
        category = excluded.category,
        title = excluded.title,
        published_at = excluded.published_at,
        markdown_content = excluded.markdown_content,
        updated_at = now()
    `, [report.slug, report.category, report.title, report.published_at, report.markdown_content])
  }
  const result = await pool.query('select count(*)::integer as count from research_reports')
  console.log(`Imported ${reports.length} reports; database now contains ${result.rows[0].count}.`)
} finally {
  await pool.end()
}
