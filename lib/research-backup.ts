import type { ResearchCategory, ResearchContentFormat } from './research'
import { githubResearchPath } from './research'

const OWNER = 'Franky779'
const REPO = 'ip-news'
const BRANCH = 'main'

type BackupInput = { category: ResearchCategory; slug: string; title: string; published_at: string; markdown_content: string; content_format: ResearchContentFormat }

export async function backupResearchToGithub(input: BackupInput): Promise<{ path: string }> {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('服务器未配置 GITHUB_TOKEN，报告已保存但未完成备份')
  const path = githubResearchPath(input.category, input.slug, input.content_format, input.title)
  const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`
  const content = input.content_format === 'html'
    ? input.markdown_content
    : `---\ntitle: ${JSON.stringify(input.title)}\ncategory: ${JSON.stringify(input.category)}\npublished_at: ${input.published_at}\n---\n\n${input.markdown_content}\n`
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'ip-hot-research-backup',
  }
  const existing = await fetch(`${endpoint}?ref=${BRANCH}`, { headers, cache: 'no-store' })
  if (!existing.ok && existing.status !== 404) throw new Error(`读取 GitHub 备份状态失败（${existing.status}）`)
  const sha = existing.ok ? String((await existing.json()).sha || '') : ''
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message: `Backup research report: ${input.title}`, content: Buffer.from(content, 'utf8').toString('base64'), branch: BRANCH, ...(sha ? { sha } : {}) }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500)
    throw new Error(`GitHub 备份失败（${response.status}）：${detail}`)
  }
  return { path }
}
