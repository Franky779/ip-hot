import assert from 'node:assert/strict'
import test from 'node:test'
import { applyOfficialSourcePolicy, isVerifiedOfficialX } from './source-trust.ts'

test('requires auditable verification fields before trusting an X source', () => {
  assert.equal(isVerifiedOfficialX({ platform: 'x', verification_status: 'verified', x_handle: 'Pixar', x_user_id: '1', x_profile_url: 'https://x.com/Pixar', official_evidence_url: 'https://pixar.com' }), true)
  assert.equal(isVerifiedOfficialX({ platform: 'x', verification_status: 'verified', x_handle: 'Pixar', x_user_id: '1', x_profile_url: 'https://x.com/Pixar' }), false)
  assert.equal(isVerifiedOfficialX({ platform: 'x', verification_status: 'unverified', x_handle: 'Pixar', x_user_id: '1', x_profile_url: 'https://x.com/Pixar', official_evidence_url: 'https://pixar.com' }), false)
})

test('deletes prohibited content before applying the official-source score override', () => {
  assert.deepEqual(applyOfficialSourcePolicy({ relevance_score: 9, is_selected: true, safety_blocked: true, trusted_official_x: true }), { action: 'delete' })
})

test('forces exactly 7 for approved official X content', () => {
  assert.deepEqual(applyOfficialSourcePolicy({ relevance_score: 2, is_selected: false, safety_blocked: false, trusted_official_x: true }), { action: 'publish', relevance_score: 7, is_selected: true })
})
