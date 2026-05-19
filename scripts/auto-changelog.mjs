#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  try {
    const envContent = readFileSync(join(root, '.env.local'), 'utf-8')
    const env = {}
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match) env[match[1]] = match[2].trim()
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()

async function callLLM(prompt) {
  const url = env.LLM_BASE_URL?.endsWith('/')
    ? env.LLM_BASE_URL + 'chat/completions'
    : env.LLM_BASE_URL + '/chat/completions'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || 'kimi-k2.6',
      messages: [
        {
          role: 'system',
          content:
            '你是技术更新日志生成助手。根据代码变更信息，生成一条简洁的中文更新日志。标题一句话概括，内容说明改了什么文件、为什么改。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM API error: ${res.status} ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

function getGitInfo() {
  try {
    const commits = execSync('git log -5 --pretty=format:"%h %s"', {
      cwd: root,
      encoding: 'utf-8',
    }).trim()
    const diffStat = execSync('git diff --stat HEAD~1', {
      cwd: root,
      encoding: 'utf-8',
    }).trim()
    const changedFiles = execSync('git diff --name-only HEAD~1', {
      cwd: root,
      encoding: 'utf-8',
    }).trim()
    return { commits, diffStat, changedFiles }
  } catch (e) {
    return { commits: '', diffStat: '', changedFiles: '' }
  }
}

async function getNextVersion(supabase) {
  const { data } = await supabase
    .from('changelogs')
    .select('version')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data?.version) return 'v1.0.0'

  const match = data.version.match(/v(\d+)\.(\d+)\.(\d+)/)
  if (!match) return 'v1.0.0'

  const [, major, minor, patch] = match
  return `v${major}.${minor}.${Number(patch) + 1}`
}

async function main() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
    process.exit(1)
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { commits, diffStat, changedFiles } = getGitInfo()

  if (!commits) {
    console.log('No git info found, skipping changelog generation')
    return
  }

  console.log('Analyzing changes...')

  const prompt = `根据以下代码变更信息，生成一条更新日志。要求：
1. 标题：一句话概括核心变更（不超过30字）
2. 内容：详细说明变更内容，包括修改了哪些文件、为什么改

最近提交：
${commits}

变更文件统计：
${diffStat || '(无详细统计)'}

变更文件列表：
${changedFiles || '(无文件列表)'}

请严格按以下格式输出，不要有多余内容：
标题：xxx
内容：xxx`

  const llmResponse = await callLLM(prompt)

  const titleMatch = llmResponse.match(/标题[：:]\s*(.+)/)
  const contentMatch = llmResponse.match(/内容[：:]\s*([\s\S]+)/)

  const title = titleMatch ? titleMatch[1].trim() : '代码更新'
  const content = contentMatch
    ? contentMatch[1].trim()
    : llmResponse.trim() || '暂无详细说明'

  const version = await getNextVersion(supabase)

  const { error } = await supabase.from('changelogs').insert({
    title,
    content,
    version,
  })

  if (error) {
    console.error('Failed to insert changelog:', error.message)
    process.exit(1)
  }

  console.log(`\n✓ Changelog ${version} created`)
  console.log(`  Title: ${title}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
