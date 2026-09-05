import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyLlmError, parseApiStatus } from './llm-errors.ts'

// ===== parseApiStatus 单元测试 =====

test('parseApiStatus extracts 3-digit status from "API N: ..." messages', () => {
  assert.equal(parseApiStatus('API 400: bad request'), 400)
  assert.equal(parseApiStatus('API 500: internal error'), 500)
  assert.equal(parseApiStatus('API 401: invalid api key'), 401)
})

test('parseApiStatus returns null when status not present', () => {
  assert.equal(parseApiStatus('fetch failed'), null)
  assert.equal(parseApiStatus('No JSON in: raw text'), null)
  assert.equal(parseApiStatus('Empty response'), null)
  assert.equal(parseApiStatus(''), null)
})

// ===== 回归保护：原有 content_blocked 用例 =====

test('classifyLlmError marks content safety as content_blocked (legacy)', () => {
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

// ===== 新增：本轮误报真实样本 =====

test('classifyLlmError catches content exists risk (DeepSeek 典型返回)', () => {
  // 即便无 status 也能判 blocked（强特征词）
  assert.equal(
    classifyLlmError(new Error('{"error":{"message":"content exists risk, please check your input"}}')),
    'content_blocked'
  )
  // 400 + content exists risk
  assert.equal(
    classifyLlmError(new Error('API 400: {"error":{"message":"content exists risk"}}')),
    'content_blocked'
  )
})

test('classifyLlmError catches content_filter (带下划线)', () => {
  assert.equal(
    classifyLlmError(new Error('API 400: {"error":"request blocked by content_filter"}}')),
    'content_blocked'
  )
  assert.equal(
    classifyLlmError(new Error('API 400: content_filter triggered')),
    'content_blocked'
  )
})

test('classifyLlmError catches data inspection', () => {
  assert.equal(
    classifyLlmError(new Error('API 400: data inspection failed, please retry')),
    'content_blocked'
  )
})

test('classifyLlmError catches 中文审核拦截变体', () => {
  assert.equal(classifyLlmError(new Error('API 400: 内容审核未通过')), 'content_blocked')
  assert.equal(classifyLlmError(new Error('API 400: 包含违规内容')), 'content_blocked')
  assert.equal(classifyLlmError(new Error('API 400: 请求包含敏感词，请修改后重试')), 'content_blocked')
})

// ===== 误伤防护 =====

test('classifyLlmError does NOT mark 5xx with generic words as blocked', () => {
  // 5xx 恒为 outage，即使 body 里出现 "risk" "safety" 等通用词
  assert.equal(classifyLlmError(new Error('API 500: internal server error')), 'outage')
  assert.equal(classifyLlmError(new Error('API 503: safety check temporarily unavailable')), 'outage')
})

test('classifyLlmError does NOT mark weak keyword alone (no 400) as blocked', () => {
  // 无 status 仅有弱特征词（如 "blocked"）不足以判 blocked，避免误伤
  // 但本测试的 "blocked" 是无 status 的纯文本 — 强特征词是 "sensitive/敏感词/content_filter..."，
  // "blocked" 是弱特征词，没 status 时不判。
  assert.equal(classifyLlmError(new Error('request blocked by upstream proxy')), 'outage')
  assert.equal(classifyLlmError(new Error('API 200: {"warning":"content may be risky"}')), 'outage')
  // 注意：API 200 没有 status 400 走弱特征词分支，所以是 outage
})

test('classifyLlmError catches 400 + weak keyword as blocked', () => {
  // status=400 + 弱特征词 → blocked
  assert.equal(
    classifyLlmError(new Error('API 400: {"error":{"message":"prompt flagged as inappropriate"}}')),
    'content_blocked'
  )
  assert.equal(
    classifyLlmError(new Error('API 400: invalid prompt format')),
    'content_blocked'
  )
})

// ===== 真故障回归保护 =====

test('classifyLlmError marks real failures as outage (legacy)', () => {
  assert.equal(classifyLlmError(new Error('API 401: {"error":"invalid api key"}')), 'outage')
  assert.equal(classifyLlmError(new Error('API 402: insufficient balance')), 'outage')
  assert.equal(classifyLlmError(new Error('API 429: Too many requests')), 'outage')
  assert.equal(classifyLlmError(new Error('fetch failed')), 'outage')
  assert.equal(classifyLlmError(new Error('No JSON in: raw text')), 'outage')
  assert.equal(classifyLlmError(new Error('API 500: internal server error')), 'outage')
})

test('classifyLlmError marks 400 without safety keyword as outage', () => {
  // 400 但无明显审核特征（如 JSON 格式错误）按真故障
  assert.equal(classifyLlmError(new Error('API 400: {"error":"invalid json in request body"}')), 'outage')
  assert.equal(classifyLlmError(new Error('API 400: missing required field "model"')), 'outage')
})

test('classifyLlmError handles non-Error inputs', () => {
  assert.equal(classifyLlmError('API 400: sensitive'), 'content_blocked')
  assert.equal(classifyLlmError('API 500: error'), 'outage')
  assert.equal(classifyLlmError(null), 'outage')
  assert.equal(classifyLlmError(undefined), 'outage')
  assert.equal(classifyLlmError({ message: 'API 400: 敏感词检测' }), 'outage') // 非 Error 也非 string，String() 转为 "[object Object]" → 无 status 无关键词 → outage
  assert.equal(classifyLlmError(42), 'outage')
})
