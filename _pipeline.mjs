// IP-HOT 分散式流水线：分批抓取 + 入库 + LLM处理 + 飞书通知
// 用法: node _pipeline.mjs [--init] [--once]

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '_pipeline_state.json');
const SOURCES_FILE = join(__dirname, '_domestic_sources.json');
const CRAWL_SCRIPT = join(__dirname, '_crawl_domestic.py');
const GROUP_SIZE = 5;
const FEISHU_UID = 'ou_e75b9fb59fc6c5566f6823cf284e2ec6';

// ── Env ──
const env = Object.fromEntries(
  readFileSync(join(__dirname, '.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://rbjygwpoxuutmxmkzkqz.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY || '';
const LLM_BASE_URL = env.LLM_BASE_URL;
const LLM_API_KEY = env.LLM_API_KEY;
const LLM_MODEL = env.LLM_MODEL || 'unknown';
const BACKUP_URL = env.LLM_BACKUP_URL;
const BACKUP_KEY = env.LLM_BACKUP_KEY;
const BACKUP_MODEL = env.LLM_BACKUP_MODEL || 'unknown';

// ── State ──
function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function initGroups() {
  const sources = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
  const groups = [];
  for (let i = 0; i < sources.length; i += GROUP_SIZE) {
    groups.push(sources.slice(i, i + GROUP_SIZE));
  }
  const state = {
    groups,
    completed: [],
    total_crawled: 0,
    total_selected: 0,
    total_groups: groups.length,
    started_at: new Date().toISOString(),
    last_group_at: null,
    rounds: 0,
  };
  saveState(state);
  return state;
}

// ── Feishu ──
function feishu(text) {
  try {
    execSync(`lark-cli --as bot im +messages-send --user-id "${FEISHU_UID}" --text "${text}"`, { timeout: 15000, stdio: 'pipe' });
  } catch (e) {
    console.log('  飞书通知失败:', e.message?.slice(0, 80));
  }
}

// ── Crawl (delegates to _crawl_domestic.py with temp source file) ──
function crawlGroup(group) {
  const tmpFile = join(__dirname, '_tmp_pipeline_sources.json');
  writeFileSync(tmpFile, JSON.stringify(group, null, 2), 'utf8');

  console.log(`  调用_crawl_domestic.py (${group.length}个源)...`);
  let stdout = '';
  let inserted = 0;
  try {
    stdout = execSync(`python "${CRAWL_SCRIPT}" --sources-file "${tmpFile}" --no-delay`, {
      cwd: __dirname,
      timeout: 600000,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    // Parse insertion count from output: "入库: X/Y 条"
    const m = stdout.match(/入库:\s*(\d+)\//);
    if (m) inserted = parseInt(m[1]);
    console.log(stdout.split('\n').filter(l => l.includes('提取') || l.includes('入库')).join('\n'));
  } catch (e) {
    console.log(`  抓取出错: ${(e.message || '').slice(0, 100)}`);
    if (e.stdout) console.log(e.stdout.slice(-500));
  }

  // Read results
  const resultsFile = join(__dirname, '_crawl_results.json');
  let results = [];
  if (existsSync(resultsFile)) {
    try {
      results = JSON.parse(readFileSync(resultsFile, 'utf8'));
    } catch {}
  }

  // Cleanup
  try { unlinkSync(tmpFile); } catch {}

  return { results, inserted };
}

// ── Supabase ──
async function insertSupabase(articlesBySource) {
  if (!SUPABASE_KEY) return 0;

  const flat = [];
  const seen = new Set();
  for (const entry of articlesBySource) {
    for (const a of entry.articles) {
      const k = entry.source + '::' + a.url;
      if (seen.has(k)) continue;
      seen.add(k);
      flat.push({ source: entry.source, url: a.url, title: a.title });
    }
  }
  if (!flat.length) return 0;

  let inserted = 0;
  for (let i = 0; i < flat.length; i += 10) {
    const batch = flat.slice(i, i + 10);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) inserted += batch.length;
    } catch (e) {
      console.log('  入库批次失败:', e.message?.slice(0, 80));
    }
    await sleep(300);
  }
  return inserted;
}

async function patchArticle(id, fields) {
  if (!SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(fields),
    });
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── LLM ──
const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫/IP/潮玩谷子/文创/文旅/博物馆/旅游纪念品/数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：
任务：
1.将标题翻译为简洁、吸引人的中文标题(不超过30字)
2.用80字以内的中文写摘要，突出IP/商业/文旅角度
3.从以下7个分类中选一个最贴切的：新作发布(动漫/游戏/IP的新作品) IP/品牌/授权(品牌联名、授权合作) 潮玩谷子(潮玩/盲盒/谷子/手办) 影视综艺(动漫改编影视/IP衍生影视) 展会活动(行业展会/市集/发布会) 文旅及商品(文旅项目/博物馆IP/旅游纪念品) 待分类
4.给出0-10的产业匹配度评分：9-10核心命中 7-8强相关 5-6中度相关 0-4弱相关
5.如果评分>=7标记为精选
6.用一句话写编辑推荐语(不超过40字)
请严格按JSON格式返回：{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`;

const POLITICAL = [
  '中共中央','习近平','李克强','政协','人大','国务院','军委','证监会','银保监',
  '央行','美联储','沪深','A股','涨停','跌停','基金','期货','外汇','债券','IPO','招股书','财报',
  '主力资金','房地产','楼市','房贷','选举','投票','弹劾','立法','法案','国防','军事','导弹',
  '航母','军队','足球','篮球','NBA','英超','车祸','地震','台风','洪水','火灾','爆炸','死亡',
  '高血压','糖尿病','癌症','新冠','疫苗','医保','减肥','油价','党纪','民主生活会','政绩观',
  '主题教育','中俄','总理','主席','省委','市委','县委','中央','常委','党委','纪委','监察',
  '巡视','扫黑','政法',
];

async function callLLM(title, baseUrl, apiKey, model) {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `标题: ${title}` }],
      max_tokens: 400,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? '';
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`No JSON in: ${raw.slice(0, 80)}`);
  const p = JSON.parse(m[0]);
  const cats = ['新作发布', 'IP/品牌/授权', '潮玩谷子', '影视综艺', '展会活动', '文旅及商品', '待分类'];
  return {
    title_cn: String(p.title_cn || title).slice(0, 100),
    summary_cn: String(p.summary_cn || '').slice(0, 200),
    category: cats.includes(p.category) ? p.category : '待分类',
    relevance_score: Math.min(10, Math.max(0, Number(p.relevance_score) || 5)),
    is_selected: (Number(p.relevance_score) || 0) >= 7,
    commentary: String(p.commentary || '').slice(0, 100),
  };
}

async function summarizeArticle(title) {
  // Kimi 3x
  for (let i = 0; i < 3; i++) {
    try { return await callLLM(title, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL); } catch {}
    if (i < 2) await sleep(2000);
  }
  // DeepSeek 2x
  if (BACKUP_URL && BACKUP_KEY) {
    for (let i = 0; i < 2; i++) {
      try { return await callLLM(title, BACKUP_URL, BACKUP_KEY, BACKUP_MODEL); } catch {}
      if (i < 1) await sleep(2000);
    }
  }
  throw new Error('All LLMs failed');
}

function isPolitical(title) {
  return POLITICAL.some(kw => title.includes(kw));
}

async function llmProcess(articleIdsTitles) {
  if (!LLM_BASE_URL || !LLM_API_KEY) return { success: 0, selected: 0, failed: 0 };

  let success = 0, selected = 0, failed = 0;
  for (const [id, title] of articleIdsTitles) {
    if (isPolitical(title)) {
      await patchArticle(id, {
        title_cn: title.slice(0, 100), summary_cn: '',
        category: '待分类', relevance_score: 1, is_selected: false, commentary: '',
      });
      continue;
    }
    try {
      const r = await summarizeArticle(title);
      await patchArticle(id, r);
      success++;
      if (r.is_selected) selected++;
    } catch (e) {
      failed++;
      console.log(`  LLM失败: ${e.message?.slice(0, 80)}`);
    }
    await sleep(500);
  }
  return { success, selected, failed };
}

// ── Main loop ──
async function runGroup(state) {
  const completed = new Set(state.completed);
  let nextIdx = null;
  for (let i = 0; i < state.total_groups; i++) {
    if (!completed.has(i)) { nextIdx = i; break; }
  }

  if (nextIdx === null) {
    state.rounds++;
    state.completed = [];
    saveState(state);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`第${state.rounds}轮完成! 累计抓取${state.total_crawled}条, 精选${state.total_selected}条`);
    console.log(`${'='.repeat(50)}\n`);
    return state;
  }

  const group = state.groups[nextIdx];
  const names = group.map(s => s.name);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[组 ${nextIdx + 1}/${state.total_groups}] ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}`);
  console.log(`${'='.repeat(50)}`);

  // ── Crawl (delegates to _crawl_domestic.py which also handles insert) ──
  const { results: crawlResults, inserted } = crawlGroup(group);
  state.total_crawled += inserted;

  // ── LLM Process ──
  const unprocessed = [];
  if (SUPABASE_KEY) {
    for (const r of crawlResults) {
      if (!r.articles.length) continue;
      try {
        const q = `source=eq.${encodeURIComponent(r.source)}&title_cn=is.null&limit=20`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,title&${q}`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const row of data) unprocessed.push([row.id, row.title]);
        }
      } catch {}
    }
  }

  console.log(`  待LLM: ${unprocessed.length}条`);
  if (unprocessed.length) {
    const { success, selected, failed } = await llmProcess(unprocessed);
    state.total_selected += selected;
    console.log(`  LLM: 成功${success} 精选${selected} 失败${failed}`);
  }

  completed.add(nextIdx);
  state.completed = [...completed].sort((a, b) => a - b);
  state.last_group_at = new Date().toISOString();
  saveState(state);

  const remaining = state.total_groups - state.completed.length;
  console.log(`  剩余: ${remaining}组 | 累计精选: ${state.total_selected}`);
  return state;
}

async function main() {
  let state = loadState();

  if (!state || process.argv.includes('--init')) {
    console.log('初始化分组...');
    state = initGroups();
    console.log(`  ${state.total_groups}个组, 每组约${GROUP_SIZE}个源`);
    feishu(`【IP-HOT】分散式抓取已就绪，${state.total_groups}组共约109个信源，开始运行。`);
  } else {
    console.log(`加载进度: ${state.completed.length}/${state.total_groups}组已完成, 累计${state.total_crawled}条, 精选${state.total_selected}条`);
    feishu(`【IP-HOT 继续抓取】上次停在${state.completed.length}/${state.total_groups}组，继续运行。`);
  }

  if (process.argv.includes('--once')) {
    await runGroup(state);
    return;
  }

  // ── Loop mode ──
  // Process all remaining groups with delays between them
  try {
    while (true) {
      state = await runGroup(state);
      const remaining = state.total_groups - state.completed.length;
      if (remaining === 0) {
        const msg = `【Claudecode完成】IP-HOT第${state.rounds}轮抓取完毕！\n累计入库: ${state.total_crawled}条\n精选文章: ${state.total_selected}条\n共${state.total_groups}组信源全部覆盖。`;
        feishu(msg);
        console.log(`\n${msg}`);
        // Wait 60-90 min before next round
        const wait = Math.random() * 30 * 60 + 60 * 60; // 60-90 minutes
        console.log(`等待${Math.round(wait / 60)}分钟后开始下一轮...`);
        feishu(`【IP-HOT】下一轮抓取将在${Math.round(wait / 60)}分钟后开始。`);
        await sleep(wait * 1000);
      } else {
        // Wait 5-10 min between groups
        const wait = Math.random() * 5 * 60 + 5 * 60; // 5-10 minutes
        console.log(`等待${Math.round(wait / 60)}分钟后处理下一组...`);
        await sleep(wait * 1000);
      }
    }
  } catch (e) {
    console.log('\n流水线意外中断:', e.message);
    feishu(`【IP-HOT 意外中断】已完成${state.completed.length}/${state.total_groups}组。${e.message?.slice(0, 50)}`);
    saveState(state);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
