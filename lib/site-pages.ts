export const ABOUT_PAGE_ID = 'about-laojia'
export const MAX_ABOUT_BLOCKS = 40
export const MAX_IMAGE_DATA_URL_LENGTH = 2_800_000
export const MAX_FEEDBACK_LENGTH = 2000

export type AboutTextBlock = {
  id: string
  type: 'heading' | 'text'
  text: string
}

export type AboutImageBlock = {
  id: string
  type: 'image'
  dataUrl: string
  alt: string
  caption: string
}

export type AboutBlock = AboutTextBlock | AboutImageBlock

export type AboutPageContent = {
  title: string
  blocks: AboutBlock[]
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateAboutPageInput(input: unknown): ValidationResult<AboutPageContent> {
  if (!input || typeof input !== 'object') return { ok: false, error: '内容格式不正确' }
  const raw = input as { title?: unknown; blocks?: unknown }
  const title = textValue(raw.title)
  if (!title || title.length > 100) return { ok: false, error: '标题不能为空且不能超过 100 字' }
  if (!Array.isArray(raw.blocks) || raw.blocks.length > MAX_ABOUT_BLOCKS) {
    return { ok: false, error: `图文内容最多 ${MAX_ABOUT_BLOCKS} 项` }
  }

  const blocks: AboutBlock[] = []
  for (const item of raw.blocks) {
    if (!item || typeof item !== 'object') return { ok: false, error: '内容格式不正确' }
    const rawBlock = item as Record<string, unknown>
    const id = textValue(rawBlock.id)
    const type = rawBlock.type
    if (!id || (type !== 'heading' && type !== 'text' && type !== 'image')) {
      return { ok: false, error: '包含不支持的内容类型' }
    }
    if (type === 'image') {
      const dataUrl = textValue(rawBlock.dataUrl)
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
        return { ok: false, error: '图片格式不支持' }
      }
      if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return { ok: false, error: '单张图片不能超过 2 MB' }
      blocks.push({ id, type, dataUrl, alt: textValue(rawBlock.alt).slice(0, 200), caption: textValue(rawBlock.caption).slice(0, 200) })
      continue
    }
    const text = textValue(rawBlock.text)
    if (!text || text.length > 5000) return { ok: false, error: '文字内容不能为空且不能超过 5000 字' }
    blocks.push({ id, type, text })
  }
  return { ok: true, value: { title, blocks } }
}

export function validateFeedbackInput(input: unknown): ValidationResult<{ content: string; email: string | null }> {
  if (!input || typeof input !== 'object') return { ok: false, error: '提交失败，请稍后重试' }
  const raw = input as { content?: unknown; email?: unknown; website?: unknown }
  if (textValue(raw.website)) return { ok: false, error: '提交失败，请稍后重试' }
  const content = textValue(raw.content)
  if (!content) return { ok: false, error: '请填写反馈内容' }
  if (content.length > MAX_FEEDBACK_LENGTH) return { ok: false, error: `反馈内容不能超过 ${MAX_FEEDBACK_LENGTH} 字` }
  const email = textValue(raw.email)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确' }
  return { ok: true, value: { content, email: email || null } }
}
