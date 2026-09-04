import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'

import { _resetAlertAggregator, sendFeishuAlertAggregated } from './feishu-alert.ts'

let messageCalls = 0
const originalFetch = globalThis.fetch

const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
  const href = String(url)
  if (href.includes('/im/v1/messages')) messageCalls += 1
  const isToken = href.includes('/auth/v3/tenant_access_token')
  return {
    ok: true,
    json: async () => isToken
      ? { code: 0, tenant_access_token: 'fake-token', expire: 7200 }
      : { code: 0 },
    text: async () => '',
  } as unknown as Response
}

beforeEach(() => {
  messageCalls = 0
  process.env.FEISHU_ALERT_OPEN_ID = 'ou_test_user'
  process.env.FEISHU_APP_ID = 'cli_test'
  process.env.FEISHU_APP_SECRET = 'test-secret'
  globalThis.fetch = fakeFetch as typeof fetch
  _resetAlertAggregator()
})

afterEach(() => {
  _resetAlertAggregator()
  delete process.env.FEISHU_ALERT_OPEN_ID
  delete process.env.FEISHU_APP_ID
  delete process.env.FEISHU_APP_SECRET
  globalThis.fetch = originalFetch
})

test('90 秒窗口内的重复告警只实际发送第一条', async () => {
  const t0 = 1_700_000_000_000
  await sendFeishuAlertAggregated('告警A', t0)
  await sendFeishuAlertAggregated('告警B', t0 + 1000)
  await sendFeishuAlertAggregated('告警C', t0 + 30_000)
  assert.equal(messageCalls, 1)
})

test('窗口重置后再次告警可发送', async () => {
  const t0 = 1_700_000_000_000
  await sendFeishuAlertAggregated('告警A', t0)
  await sendFeishuAlertAggregated('告警B', t0 + 90_000 + 1000)
  assert.equal(messageCalls, 2)
})