import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const root = resolve(process.cwd())
const reports = JSON.parse(await readFile(resolve(root, 'ops/migration/research-html-reports.json'), 'utf8'))
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

try {
  await pool.query(`
    alter table research_reports add column if not exists content_format text not null default 'markdown';
    alter table research_reports drop constraint if exists research_reports_content_format_check;
    alter table research_reports add constraint research_reports_content_format_check check (content_format in ('markdown', 'html'));
  `)
  for (const report of reports) {
    const content = await readFile(resolve(root, report.content_file), 'utf8')
    await pool.query(`
      insert into research_reports (slug, category, title, published_at, markdown_content, content_format, github_backup_status)
      values ($1, $2, $3, $4, $5, 'html', 'pending')
      on conflict (slug) do update set
        category = excluded.category,
        title = excluded.title,
        published_at = excluded.published_at,
        markdown_content = excluded.markdown_content,
        content_format = excluded.content_format,
        github_backup_status = 'pending',
        github_backup_error = null,
        updated_at = now()
    `, [report.slug, report.category, report.title, report.published_at, content])
  }
  console.log(`Imported ${reports.length} HTML research report(s).`)
} finally {
  await pool.end()
}
