import { Pool, type QueryResult as PgQueryResult } from 'pg'

type DbError = {
  message: string
  code?: string
  details?: string
}

type Row = any

type QueryResult<T = Row[]> = {
  data: T
  error: DbError | null
  count: number | null
}

type SelectOptions = {
  count?: 'exact'
  head?: boolean
}

type OrderOptions = {
  ascending?: boolean
  nullsFirst?: boolean
}

type UpsertOptions = {
  onConflict: string
  ignoreDuplicates?: boolean
}

type Filter = {
  sql: string
  values: unknown[]
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

function identifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid database identifier: ${value}`)
  }
  return `"${value}"`
}

function columnList(value: string): string {
  if (value.trim() === '*') return '*'
  return value
    .split(',')
    .map((part) => identifier(part.trim()))
    .join(', ')
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('Missing DATABASE_URL environment variable')
  return value
}

declare global {
  var __ipHotPool: Pool | undefined
}

function getPool(): Pool {
  if (!globalThis.__ipHotPool) {
    globalThis.__ipHotPool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  }
  return globalThis.__ipHotPool
}

class QueryBuilder implements PromiseLike<QueryResult> {
  private operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private selected = '*'
  private selectOptions: SelectOptions = {}
  private mutationRows: Record<string, unknown>[] = []
  private upsertOptions: UpsertOptions | null = null
  private filters: Filter[] = []
  private orders: string[] = []
  private rowLimit: number | null = null
  private rowOffset: number | null = null
  private resultMode: 'many' | 'single' | 'maybeSingle' = 'many'
  private returnRows = false

  constructor(private readonly table: string) {
    identifier(table)
  }

  select(columns = '*', options: SelectOptions = {}): this {
    this.selected = columns
    this.selectOptions = options
    if (this.operation !== 'select') this.returnRows = true
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = 'insert'
    this.mutationRows = Array.isArray(values) ? values : [values]
    return this
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], options: UpsertOptions): this {
    this.operation = 'upsert'
    this.mutationRows = Array.isArray(values) ? values : [values]
    this.upsertOptions = options
    return this
  }

  update(values: Record<string, unknown>): this {
    this.operation = 'update'
    this.mutationRows = [values]
    return this
  }

  delete(): this {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    return this.addComparison(column, value === null ? 'IS' : '=', value)
  }

  neq(column: string, value: unknown): this {
    return this.addComparison(column, value === null ? 'IS NOT' : '<>', value)
  }

  gte(column: string, value: unknown): this {
    return this.addComparison(column, '>=', value)
  }

  lte(column: string, value: unknown): this {
    return this.addComparison(column, '<=', value)
  }

  is(column: string, value: unknown): this {
    return this.addComparison(column, 'IS', value)
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator !== 'is') throw new Error(`Unsupported not operator: ${operator}`)
    return this.addComparison(column, 'IS NOT', value)
  }

  in(column: string, values: unknown[]): this {
    const name = identifier(column)
    if (values.length === 0) {
      this.filters.push({ sql: 'FALSE', values: [] })
      return this
    }
    this.filters.push({
      sql: `${name} IN (${values.map(() => '?').join(', ')})`,
      values,
    })
    return this
  }

  overlaps(column: string, values: unknown[]): this {
    this.filters.push({ sql: `${identifier(column)} && ?`, values: [values] })
    return this
  }

  or(expression: string): this {
    const filters = expression.split(/,(?=[a-z_][a-z0-9_]*\.(?:ilike|eq|is)\.)/).map((item) => {
      const [column, operator, ...rawParts] = item.split('.')
      const raw = rawParts.join('.')
      const name = identifier(column)
      if (operator === 'ilike') return { sql: `${name} ILIKE ?`, values: [raw] }
      if (operator === 'eq') return { sql: `${name} = ?`, values: [this.parseFilterValue(raw)] }
      if (operator === 'is') {
        const value = this.parseFilterValue(raw)
        if (value !== null) throw new Error(`Unsupported IS value: ${raw}`)
        return { sql: `${name} IS NULL`, values: [] }
      }
      throw new Error(`Unsupported OR operator: ${operator}`)
    })
    this.filters.push({
      sql: `(${filters.map((filter) => filter.sql).join(' OR ')})`,
      values: filters.flatMap((filter) => filter.values),
    })
    return this
  }

  order(column: string, options: OrderOptions = {}): this {
    const direction = options.ascending === false ? 'DESC' : 'ASC'
    const nulls = options.nullsFirst === undefined ? '' : options.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'
    this.orders.push(`${identifier(column)} ${direction}${nulls}`)
    return this
  }

  limit(value: number): this {
    this.rowLimit = value
    return this
  }

  range(from: number, to: number): this {
    this.rowOffset = from
    this.rowLimit = Math.max(0, to - from + 1)
    return this
  }

  single(): Promise<QueryResult<any>> {
    this.resultMode = 'single'
    this.rowLimit ??= 2
    return this.execute()
  }

  maybeSingle(): Promise<QueryResult<any>> {
    this.resultMode = 'maybeSingle'
    this.rowLimit ??= 2
    return this.execute()
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private addComparison(column: string, operator: string, value: unknown): this {
    const name = identifier(column)
    if (value === null) {
      this.filters.push({ sql: `${name} ${operator} NULL`, values: [] })
    } else {
      this.filters.push({ sql: `${name} ${operator} ?`, values: [value] })
    }
    return this
  }

  private parseFilterValue(value: string): string | boolean | null {
    if (value === 'null') return null
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  }

  private compile(): { text: string; values: unknown[]; countQuery: boolean } {
    const values: unknown[] = []
    const bind = (sql: string, params: unknown[]): string => sql.replace(/\?/g, () => {
      values.push(params.shift())
      return `$${values.length}`
    })
    const table = identifier(this.table)
    const where = this.filters.length === 0
      ? ''
      : ` WHERE ${this.filters.map((filter) => bind(filter.sql, [...filter.values])).join(' AND ')}`
    const returning = this.returnRows ? ` RETURNING ${columnList(this.selected)}` : ''
    let text: string

    if (this.operation === 'select') {
      const countQuery = this.selectOptions.count === 'exact' && this.selectOptions.head === true
      text = countQuery ? `SELECT count(*)::integer AS count FROM ${table}${where}` : `SELECT ${columnList(this.selected)} FROM ${table}${where}`
      if (!countQuery && this.orders.length > 0) text += ` ORDER BY ${this.orders.join(', ')}`
      if (!countQuery && this.rowLimit !== null) text += ` LIMIT ${Math.max(0, this.rowLimit)}`
      if (!countQuery && this.rowOffset !== null) text += ` OFFSET ${Math.max(0, this.rowOffset)}`
      return { text, values, countQuery }
    }

    if (this.operation === 'insert' || this.operation === 'upsert') {
      if (this.mutationRows.length === 0) return { text: 'SELECT NULL WHERE FALSE', values: [], countQuery: false }
      const columns = Object.keys(this.mutationRows[0])
      if (columns.length === 0) throw new Error('Cannot insert an empty object')
      const columnSql = columns.map(identifier).join(', ')
      const rowsSql = this.mutationRows.map((row) => {
        if (columns.some((column) => !(column in row))) throw new Error('All inserted rows must use the same columns')
        return `(${columns.map((column) => bind('?', [row[column]])).join(', ')})`
      }).join(', ')
      text = `INSERT INTO ${table} (${columnSql}) VALUES ${rowsSql}`
      if (this.operation === 'upsert') {
        if (!this.upsertOptions) throw new Error('Missing upsert options')
        const conflict = this.upsertOptions.onConflict.split(',').map((column) => identifier(column.trim())).join(', ')
        if (this.upsertOptions.ignoreDuplicates) {
          text += ` ON CONFLICT (${conflict}) DO NOTHING`
        } else {
          const updates = columns.map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`).join(', ')
          text += ` ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`
        }
      }
      return { text: text + returning, values, countQuery: false }
    }

    if (this.operation === 'update') {
      const row = this.mutationRows[0]
      const columns = Object.keys(row)
      if (columns.length === 0) throw new Error('Cannot update with an empty object')
      const setSql = columns.map((column) => `${identifier(column)} = ${bind('?', [row[column]])}`).join(', ')
      text = `UPDATE ${table} SET ${setSql}${where}${returning}`
      return { text, values, countQuery: false }
    }

    text = `DELETE FROM ${table}${where}${returning}`
    return { text, values, countQuery: false }
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      const compiled = this.compile()
      const result: PgQueryResult<Row> = await getPool().query(compiled.text, compiled.values)
      if (compiled.countQuery) {
        return { data: null, error: null, count: result.rows[0]?.count ?? 0 }
      }
      const rows = result.rows
      if (this.resultMode === 'single' && rows.length !== 1) {
        return { data: null, error: { message: `Expected one row, received ${rows.length}` }, count: null }
      }
      if (this.resultMode === 'maybeSingle' && rows.length > 1) {
        return { data: null, error: { message: `Expected at most one row, received ${rows.length}` }, count: null }
      }
      const data = this.resultMode === 'many' ? rows : rows[0] ?? null
      return { data, error: null, count: null }
    } catch (error) {
      const value = error as Error & { code?: string; detail?: string }
      return {
        data: this.resultMode === 'many' ? [] : null,
        error: { message: value.message, code: value.code, details: value.detail },
        count: null,
      }
    }
  }
}

export class DatabaseClient {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table)
  }
}

const databaseClient = new DatabaseClient()

// These names are retained temporarily so the migration stays isolated to the data layer.
// Both functions connect directly to the local PostgreSQL DATABASE_URL.
export function getSupabase(): DatabaseClient {
  return databaseClient
}

export function createServiceClient(): DatabaseClient {
  return databaseClient
}
