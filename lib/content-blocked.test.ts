import assert from 'node:assert/strict'
import test from 'node:test'

import { markContentBlocked, CONTENT_BLOCKED_CATEGORY, CONTENT_BLOCKED_MARKER } from './content-blocked.ts'

// ===== 轻量 fake：只覆盖 markContentBlocked 真正用到的 .from().update().eq() 链 =====
type UpdateCall = { table: string; values: Record<string, unknown>; where: { col: string; val: unknown } }
type FakeResult = { error: { message: string } | null }

function makeFakeDb(calls: UpdateCall[], result: FakeResult) {
  return {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(col: string, val: unknown) {
              calls.push({ table, values, where: { col, val } })
              return Promise.resolve(result)
            },
          }
        },
      }
    },
  } as any
}

test('markContentBlocked writes correct终态 fields', async () => {
  const calls: UpdateCall[] = []
  const db = makeFakeDb(calls, { error: null })

  const r = await markContentBlocked(db, { id: 'a-1', title: '某 IP 联名新品上市' })

  assert.equal(r.ok, true)
  assert.equal(calls.length, 1)
  const c = calls[0]
  assert.equal(c.table, 'articles')
  assert.equal(c.where.col, 'id')
  assert.equal(c.where.val, 'a-1')
  // 脱队唯一钥匙：title_cn 必须非空
  assert.equal(c.values.title_cn, '某 IP 联名新品上市')
  // 终态标记文字
  assert.equal(c.values.summary_cn, CONTENT_BLOCKED_MARKER)
  assert.match(c.values.summary_cn, /审核拦截/)
  // 复用「待人工复核」终态
  assert.equal(c.values.category, CONTENT_BLOCKED_CATEGORY)
  assert.equal(c.values.category, '待人工复核')
  // 评分必须为 NULL，避开 auto-cleanup（仅清 ≤4 且非官号；NULL 不命中）
  assert.equal(c.values.relevance_score, null)
  assert.equal(c.values.is_selected, false)
})

test('markContentBlocked uses placeholder when title is empty', async () => {
  const calls: UpdateCall[] = []
  const db = makeFakeDb(calls, { error: null })

  await markContentBlocked(db, { id: 'a-2', title: null })
  assert.equal(calls[0].values.title_cn, '(无标题)')

  await markContentBlocked(db, { id: 'a-3', title: '   ' })
  assert.equal(calls[1].values.title_cn, '(无标题)')
})

test('markContentBlocked returns error on db failure', async () => {
  const calls: UpdateCall[] = []
  const db = makeFakeDb(calls, { error: { message: 'connection timeout' } })

  const r = await markContentBlocked(db, { id: 'a-4', title: 'test' })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'connection timeout')
  // 仍然发出了 UPDATE 请求
  assert.equal(calls.length, 1)
})

test('CONTENT_BLOCKED_CATEGORY matches pending-review query value', () => {
  // 关键不变量：app/api/admin/pending-review/route.ts:25/40 用 .eq('category', '待人工复核')
  // 我们的终态 category 必须与之一致，否则拦截文章不会出现在后台复核队列
  assert.equal(CONTENT_BLOCKED_CATEGORY, '待人工复核')
})
