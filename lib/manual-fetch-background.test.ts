import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MANUAL_FETCH_ASYNC_QUERY,
  MANUAL_FETCH_BACKGROUND_QUERY,
  buildManualFetchBackgroundRequest,
} from './manual-fetch-background.ts'

test('turns a manual async request into a non-recursive background request', () => {
  const request = new Request(`https://hot.laojia-ip.com/api/cron/fetch-and-process?${MANUAL_FETCH_ASYNC_QUERY}=1&batch=2`, {
    headers: { 'x-admin-password': 'secret' },
  })

  const backgroundRequest = buildManualFetchBackgroundRequest(request)
  const url = new URL(backgroundRequest.url)

  assert.equal(url.searchParams.get(MANUAL_FETCH_ASYNC_QUERY), null)
  assert.equal(url.searchParams.get(MANUAL_FETCH_BACKGROUND_QUERY), '1')
  assert.equal(url.searchParams.get('batch'), '2')
  assert.equal(backgroundRequest.headers.get('x-admin-password'), 'secret')
})
