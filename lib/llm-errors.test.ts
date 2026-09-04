import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyLlmError } from './llm-errors.ts'

test('classifyLlmError marks content safety as content_blocked', () => {
  assert.equal(
    classifyLlmError(new Error('API 500: {"error":{"message":"sensitive words detected (request id: 20260904084040234x)","type":"new_api_error"}}')),
    'content_blocked'
  )
  assert.equal(
    classifyLlmError(new Error('API 403: {"error":{"message":"Content blocked by policy"}}')),
    'content_blocked'
  )
  assert.equal(classifyLlmError(new Error('API 500: 检测到敏感词，请求被拦截')), 'content_blocked')
})

test('classifyLlmError marks real failures as outage', () => {
  assert.equal(classifyLlmError(new Error('API 401: {"error":"invalid api key"}')), 'outage')
  assert.equal(classifyLlmError(new Error('API 402: insufficient balance')), 'outage')
  assert.equal(classifyLlmError(new Error('API 429: Too many requests')), 'outage')
  assert.equal(classifyLlmError(new Error('fetch failed')), 'outage')
  assert.equal(classifyLlmError(new Error('No JSON in: raw text')), 'outage')
  assert.equal(classifyLlmError(new Error('API 500: internal server error')), 'outage')
})