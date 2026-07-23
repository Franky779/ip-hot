import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg
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
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

function identifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid identifier: ${value}`)
  return `"${value}"`
}

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

const envPath = resolve(process.argv[2] || '.env.production.local')
const inputDir = resolve(process.argv[3] || 'migration-data')
const env = { ...parseEnv(await readFile(envPath, 'utf8')), ...process.env }
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 2 })
const schema = await readFile(resolve('ops/postgres/schema.sql'), 'utf8')
await pool.query(schema)

try {
  for (const table of TABLES) {
    const rows = JSON.parse(await readFile(resolve(inputDir, `${table}.json`), 'utf8'))
    if (rows.length === 0) {
      console.log(`${table}: 0`)
      continue
    }
    const columns = Object.keys(rows[0])
    const quotedColumns = columns.map(identifier)
    const updateColumns = columns.filter((column) => column !== 'id')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250)
        const values = []
        const groups = batch.map((row) => {
          const placeholders = columns.map((column) => {
            values.push(row[column])
            return `$${values.length}`
          })
          return `(${placeholders.join(', ')})`
        })
        const conflict = updateColumns.length === 0
          ? 'DO NOTHING'
          : `DO UPDATE SET ${updateColumns.map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`).join(', ')}`
        await client.query(
          `INSERT INTO ${identifier(table)} (${quotedColumns.join(', ')}) VALUES ${groups.join(', ')} ON CONFLICT ("id") ${conflict}`,
          values,
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    const result = await pool.query(`SELECT count(*)::integer AS count FROM ${identifier(table)}`)
    console.log(`${table}: ${result.rows[0].count}`)
  }
} finally {
  await pool.end()
}

