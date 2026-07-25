import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAboutPageInput, validateFeedbackInput } from './site-pages.ts'

test('accepts structured about-page content and trims text', () => {
  const result = validateAboutPageInput({
    title: '  关于老贾  ',
    blocks: [
      { id: 'intro', type: 'heading', text: '  从行业到 IP  ' },
      { id: 'body', type: 'text', text: '  这里是正文。  ' },
      { id: 'photo', type: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=', alt: '  老贾  ', caption: '  工作照  ' },
    ],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.title, '关于老贾')
  assert.deepEqual(result.value.blocks[0], { id: 'intro', type: 'heading', text: '从行业到 IP' })
  assert.deepEqual(result.value.blocks[2], { id: 'photo', type: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=', alt: '老贾', caption: '工作照' })
})

test('rejects unsupported about-page blocks and oversized images', () => {
  assert.deepEqual(validateAboutPageInput({ title: '关于老贾', blocks: [{ id: 'html', type: 'html', text: '<script>alert(1)</script>' }] }), { ok: false, error: '包含不支持的内容类型' })
  assert.deepEqual(validateAboutPageInput({ title: '关于老贾', blocks: [{ id: 'large-photo', type: 'image', dataUrl: `data:image/jpeg;base64,${'a'.repeat(2_800_000)}`, alt: '', caption: '' }] }), { ok: false, error: '单张图片不能超过 2 MB' })
})

test('normalizes valid feedback and rejects empty, invalid, or automated submissions', () => {
  assert.deepEqual(validateFeedbackInput({ content: '  希望增加每周报告。  ', email: '  reader@example.com  ', website: '' }), { ok: true, value: { content: '希望增加每周报告。', email: 'reader@example.com' } })
  assert.deepEqual(validateFeedbackInput({ content: '   ', email: '', website: '' }), { ok: false, error: '请填写反馈内容' })
  assert.deepEqual(validateFeedbackInput({ content: '反馈', email: 'not-an-email', website: '' }), { ok: false, error: '邮箱格式不正确' })
  assert.deepEqual(validateFeedbackInput({ content: '反馈', email: '', website: 'bot' }), { ok: false, error: '提交失败，请稍后重试' })
})
