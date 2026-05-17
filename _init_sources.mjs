// 将 info-sources-data.json 导入 Supabase 的 info_sources 表
// 用法: node _init_sources.mjs
// 依赖: @supabase/supabase-js (项目已安装)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY')
  console.error('请确保 .env.local 已配置')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// 读取 JSON
const jsonPath = join(__dirname, '.claude', 'skills', 'ip-news', 'references', 'info-sources-data.json')
// 先尝试项目外路径，再尝试其他位置
let data
const possiblePaths = [
  jsonPath,
  join('d:', 'claudecode', '.claude', 'skills', 'ip-news', 'references', 'info-sources-data.json'),
  join(__dirname, 'public', 'info-sources-data.json'),
]

for (const p of possiblePaths) {
  try {
    data = JSON.parse(readFileSync(p, 'utf8'))
    console.log(`✓ 读取数据: ${p}`)
    break
  } catch {
    // try next
  }
}

if (!data) {
  console.error('无法找到 info-sources-data.json')
  process.exit(1)
}

async function init() {
  // 1. 检查表是否存在
  console.log('1) 检查 info_sources 表...')
  const { error: checkError } = await supabase.from('info_sources').select('id').limit(1)

  if (checkError && checkError.code === 'PGRST204') {
    console.error('\n❌ info_sources 表不存在')
    console.error('\n请在 Supabase Dashboard → SQL Editor 中执行 setup-db.sql 中的建表语句:')
    console.error(`
CREATE TABLE IF NOT EXISTS public.info_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id TEXT NOT NULL,
  section_title TEXT NOT NULL,
  region TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_info_sources_section_id ON public.info_sources (section_id);
CREATE INDEX idx_info_sources_region ON public.info_sources (region);
CREATE INDEX idx_info_sources_sort_order ON public.info_sources (sort_order);
ALTER TABLE public.info_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on info_sources" ON public.info_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon read access on info_sources" ON public.info_sources
  FOR SELECT TO anon USING (true);
`)
    process.exit(1)
  }

  // 2. 清空现有数据（可选，如需保留请注释掉）
  console.log('2) 清空现有数据...')
  await supabase.from('info_sources').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // 3. 导入 website sources
  console.log('3) 导入网站信息源...')
  let sortOrder = 0
  const records = []

  for (const section of data.sections) {
    for (const item of section.items) {
      records.push({
        section_id: section.id,
        section_title: section.title,
        region: section.region,
        name: item.n,
        url: item.u,
        type: item.t,
        description: item.d || '',
        method: item.m || '',
        sort_order: sortOrder++,
      })
    }
  }

  // 批量插入 (每次 100 条)
  const BATCH_SIZE = 100
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('info_sources').insert(batch)
    if (error) {
      console.error(`插入失败 (${i}-${i + batch.length}):`, error.message)
      process.exit(1)
    }
    console.log(`   插入 ${i + 1}-${Math.min(i + BATCH_SIZE, records.length)} / ${records.length}`)
  }

  // 4. 导入 RSS
  console.log('4) 导入 RSS 订阅源...')
  for (const rssSection of data.rssSections) {
    for (const item of rssSection.items) {
      const region = rssSection.title.includes('日本')
        ? 'japan'
        : rssSection.title.includes('海外')
          ? 'overseas'
          : 'domestic'

      const { error } = await supabase.from('info_sources').insert({
        section_id: `rss-${region}`,
        section_title: rssSection.title,
        region,
        name: item.n,
        url: item.u,
        type: 'RSS订阅',
        description: '',
        method: item.note || '',
        sort_order: sortOrder++,
      })
      if (error) {
        console.error('RSS 插入失败:', error.message)
      }
    }
  }

  // 5. 导入 Tools
  console.log('5) 导入工具...')
  for (const tool of data.tools) {
    const { error } = await supabase.from('info_sources').insert({
      section_id: 'tools',
      section_title: 'RSS聚合器与工具推荐',
      region: 'domestic',
      name: tool.n,
      url: '',
      type: tool.t,
      description: tool.d || '',
      method: '',
      sort_order: sortOrder++,
    })
    if (error) {
      console.error('Tool 插入失败:', error.message)
    }
  }

  console.log('\n✓ 初始化完成!')
  console.log(`  共导入 ${records.length} 条网站 + ${data.rssSections.reduce((a, s) => a + s.items.length, 0)} 条 RSS + ${data.tools.length} 个工具`)
}

init().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
