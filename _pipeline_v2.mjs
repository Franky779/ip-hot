#!/usr/bin/env node
// IP-HOT 统一流水线 v2
// 合并旧4条流水线为1条，7步标准流程
// 用法: node _pipeline_v2.mjs [--once] [--init] [--llm-only] [--group N]

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '_pipeline_v2_state.json');
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
const LLM_MODEL = env.LLM_MODEL || 'kimi-for-coding';
const BACKUP_URL = env.LLM_BACKUP_URL;
const BACKUP_KEY = env.LLM_BACKUP_KEY;
const BACKUP_MODEL = env.LLM_BACKUP_MODEL || 'deepseek-chat';

// ── State ──
function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ── 1. 启动 ──
function initPipeline() {
  // 读取 _domestic_sources.json（全量国内源）
  const sources = JSON.parse(readFileSync(join(__dirname, '_domestic_sources.json'), 'utf8'));
  const groups = [];
  for (let i = 0; i < sources.length; i += GROUP_SIZE) {
    groups.push(sources.slice(i, i + GROUP_SIZE));
  }
  const state = {
    groups,
    completed: [],
    total_groups: groups.length,
    total_fetched: 0,
    total_inserted: 0,
    total_noise_blocked: 0,
    total_llm_processed: 0,
    total_llm_selected: 0,
    total_llm_failed: 0,
    total_low_score_deleted: 0,
    rounds: 0,
    started_at: new Date().toISOString(),
    last_group_stats: null,
  };
  saveState(state);
  return state;
}

// ── Feishu ──
function feishu(text) {
  try {
    execSync(`lark-cli --as bot im +messages-send --user-id "${FEISHU_UID}" --text "${text}"`, {
      timeout: 15000, stdio: 'pipe',
    });
  } catch (e) {
    console.log('  飞书通知失败:', (e.message || '').slice(0, 80));
  }
}

// ── Supabase helpers ──
async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function supabaseInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=source,url`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  return res.ok;
}

async function supabasePatch(id, fields) {
  await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
}

async function supabaseDelete(ids) {
  if (!ids.length) return 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  const data = await res.json();
  return data?.length || ids.length;
}

async function persistQualityAudit(qualityResults) {
  if (!SUPABASE_KEY || !qualityResults.length) return;
  const now = new Date().toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cron_logs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      trigger_type: 'local_pipeline_quality',
      status: qualityResults.some(r => r.status === 'failed') ? 'error' : 'success',
      started_at: now,
      ended_at: now,
      llm_processed: qualityResults.filter(r => r.status === 'scored').length,
      llm_failed: qualityResults.filter(r => r.status === 'failed').length,
      details: { qualityResults },
    }),
  });
  if (!res.ok) throw new Error(`Quality audit failed: ${res.status}`);
}

// ── Update pipeline_state DB table ──
async function updateDbState(fields) {
  if (!SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/pipeline_state?id=eq.1`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...fields, last_update: new Date().toISOString() }),
    });
  } catch {}
}
// Ensure row exists
async function ensureDbState() {
  if (!SUPABASE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pipeline_state?id=eq.1&select=id`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const data = await res.json();
    if (!data?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/pipeline_state`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ id: 1, status: 'idle' }),
      });
    }
  } catch {}
}

// ── 2. 预抓取（复用 _crawl_domestic.py） ──
async function fetchGroup(group, state) {
  const tmpFile = join(__dirname, '_tmp_pipeline_sources.json');
  writeFileSync(tmpFile, JSON.stringify(group, null, 2), 'utf8');

  console.log(`  调用 _crawl_domestic.py (${group.length}个源)...`);
  let stdout = '';
  let inserted = 0;
  try {
    stdout = execSync(`python "${CRAWL_SCRIPT}" --sources-file "${tmpFile}" --no-delay`, {
      cwd: __dirname, timeout: 600000, stdio: 'pipe', encoding: 'utf8',
    });
    const m = stdout.match(/入库:\s*(\d+)\//);
    if (m) inserted = parseInt(m[1]);
    console.log(stdout.split('\n').filter(l => l.includes('提取') || l.includes('入库')).join('\n'));
  } catch (e) {
    console.log(`  抓取出错: ${(e.message || '').slice(0, 100)}`);
    if (e.stdout) console.log(e.stdout.slice(-500));
  }

  // 读结果
  const resultsFile = join(__dirname, '_crawl_results.json');
  let results = [];
  if (existsSync(resultsFile)) {
    try { results = JSON.parse(readFileSync(resultsFile, 'utf8')); } catch {}
  }

  try { unlinkSync(tmpFile); } catch {}

  // 统计噪音
  let noiseBlocked = 0;
  for (const r of results) {
    // _crawl_domestic.py 中的 is_noise_cn 已在提取时过滤，
    // noisy count 从输出推算
  }
  const noiseMatch = stdout.match(/噪音:(\d+)/);
  if (noiseMatch) noiseBlocked = parseInt(noiseMatch[1]);
  state.total_noise_blocked += noiseBlocked;
  state.total_fetched += inserted;

  return { results, inserted, noiseBlocked };
}

// ── 5. LLM 处理（统一调用 lib/llm.ts 逻辑的内联版） ──
const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下12个分类中选一个最贴切的：
   - 创作/上新：动漫/IP的新作品、新动画、新角色、新PV发布、创作者动态
   - IP/品牌/授权：品牌联名、授权合作、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品
   - 零售/渠道：IP衍生品零售渠道、线下门店扩张、渠道合作
   - 影视综艺：动漫改编影视、IP衍生影视、虚拟偶像综艺
   - 游戏/体育：游戏新作、电竞、游戏公司动态、体育IP化
   - AI/新技术：AI+内容创作、AIGC、数字藏品/NFT、元宇宙、XR
   - 展会活动：行业展会、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园
   - 艺术/亚文化：当代艺术、涂鸦、街头文化、亚文化社群
   - 政策规则：动漫/文创/潮玩/文旅相关产业政策、行业法规、政府扶持计划、行业规范、市场准入、税收优惠、进出口政策
   - 版权保护：版权登记、维权诉讼、侵权打击、版权交易平台、IP版权纠纷、盗版治理、商标争议、知识产权保护
   - 待分类：无法明确归入以上类型的资讯
4. 给出 0-10 的产业匹配度评分：
   - 9-10 核心命中 | 7-8 强相关 | 4-6 中度相关 | 0-3 弱相关（会被删除）
5. 评分 >= 7 标记为精选
6. 用一句话写推荐语（20字以内），不要加署名
7. ⚠️ 如果与动漫/IP/潮玩/文创/文旅/博物馆完全无关，评分给 0

请严格按JSON返回：{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`;

const CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺',
  '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化',
  '政策规则', '版权保护', '待分类',
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
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? '';
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`No JSON in: ${raw.slice(0, 80)}`);
  const p = JSON.parse(m[0]);
  const score = Math.min(10, Math.max(0, Number(p.relevance_score) || 5));
  return {
    title_cn: String(p.title_cn || title).slice(0, 100),
    summary_cn: String(p.summary_cn || '').slice(0, 200),
    category: CATEGORIES.includes(p.category) ? p.category : '待分类',
    relevance_score: score,
    is_selected: score >= 7,
    commentary: String(p.commentary || '待人工编辑').slice(0, 100),
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
  // 降级
  return {
    title_cn: title.slice(0, 60), summary_cn: '',
    category: '待分类', relevance_score: 5,
    is_selected: false, commentary: '待人工编辑',
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 批量 LLM 处理 ──
async function llmProcessBatch(state) {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    console.log('  LLM 未配置，跳过');
    return { success: 0, selected: 0, failed: 0, qualityResults: [] };
  }

  // 取未处理的文章
  const BATCH = 20;
  const unprocessed = await supabaseQuery(
    `/rest/v1/articles?select=id,title,url,source&title_cn=is.null&limit=${BATCH}&order=created_at.desc`
  );

  if (!unprocessed?.length) {
    console.log('  无待处理文章');
    return { success: 0, selected: 0, failed: 0, qualityResults: [] };
  }

  console.log(`  LLM处理 ${unprocessed.length} 条...`);
  let success = 0, selected = 0, failed = 0;
  const qualityResults = [];

  for (const row of unprocessed) {
    try {
      const r = await summarizeArticle(row.title);
      await supabasePatch(row.id, r);
      success++;
      if (r.is_selected) selected++;
      qualityResults.push({
        source: row.source, title: row.title, url: row.url,
        score: r.relevance_score, selected: r.is_selected,
        commentary: r.commentary, status: 'scored',
      });
    } catch (e) {
      failed++;
      qualityResults.push({
        source: row.source, title: row.title, url: row.url,
        score: null, selected: false, commentary: '', status: 'failed',
      });
      console.log(`    LLM失败: ${(e.message || '').slice(0, 60)}`);
    }
    await sleep(500); // API rate limit
  }

  state.total_llm_processed += success;
  state.total_llm_selected += selected;
  state.total_llm_failed += failed;
  return { success, selected, failed, qualityResults };
}

// ── 5 之后：删除低分文章 + 无关推荐理由（统一标准） ──
async function deleteLowScore(state) {
  if (!SUPABASE_KEY) return 0;
  let total = 0;

  // 统一判断函数（与 lib/llm.ts 中 shouldIgnoreArticle 逻辑一致）
  const shouldIgnore = (score, commentary) => {
    if ((score ?? 10) <= 3) return true;
    if (!commentary || commentary === '待人工编辑') return false;
    return /完全无关|与[一-龥\/]{1,20}无关|无关产业|建议不收录|不建议收录/.test(commentary);
  };

  try {
    // 一次查询：按最新优先，查500条，本地统一判断
    const data = await supabaseQuery(
      `/rest/v1/articles?select=id,relevance_score,commentary&title_cn=not.is.null&commentary=not.is.null&order=created_at.desc&limit=500`
    );
    if (data?.length) {
      const ids = data.filter(a => shouldIgnore(a.relevance_score, a.commentary)).map(a => a.id);
      if (ids.length) {
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50);
          const deleted = await supabaseDelete(batch);
          total += deleted;
        }
        console.log(`  删除低分/无关文章: ${ids.length} 条`);
      }
    }
  } catch (e) {
    console.log(`  删低分/无关失败: ${(e.message || '').slice(0, 60)}`);
  }

  if (total > 0) {
    state.total_low_score_deleted += total;
  }
  return total;
}

// ── 主循环：跑一个组 ──
async function runGroup(state) {
  const completed = new Set(state.completed);
  let nextIdx = null;
  for (let i = 0; i < state.total_groups; i++) {
    if (!completed.has(i)) { nextIdx = i; break; }
  }

  if (nextIdx === null) {
    // 一轮完成
    state.rounds++;
    state.completed = [];
    saveState(state);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`第${state.rounds}轮完成! 抓取${state.total_fetched} | 噪音${state.total_noise_blocked} | LLM${state.total_llm_processed} | 精选${state.total_llm_selected} | 删分${state.total_low_score_deleted}`);
    console.log(`${'='.repeat(50)}\n`);
    return state;
  }

  const group = state.groups[nextIdx];
  const names = group.map(s => s.name);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[组 ${nextIdx + 1}/${state.total_groups}] ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}`);
  console.log(`${'='.repeat(50)}`);

  // Step 2+3+4: 抓取+清洗+入库
  await updateDbState({ status: 'running', stage: 'fetching', current_source: names[0], current_group: nextIdx + 1, total_groups: state.total_groups });
  const { results, inserted, noiseBlocked } = await fetchGroup(group, state);

  // Step 5: LLM 处理
  await updateDbState({ stage: 'llm', current_source: names[0] });
  const llmStats = await llmProcessBatch(state);

  // 删除前先持久化评分审计，避免低分样本被清理后统计失真。
  await updateDbState({ stage: 'cleanup' });
  try {
    await persistQualityAudit(llmStats.qualityResults);
  } catch (e) {
    console.log(`  信源审计保存失败: ${(e.message || '').slice(0, 60)}`);
  }
  await deleteLowScore(state);

  // 记录
  state.last_group_stats = {
    group_idx: nextIdx, group_names: names,
    fetched: inserted, noise_blocked: noiseBlocked,
    llm_processed: llmStats.success, llm_selected: llmStats.selected, llm_failed: llmStats.failed,
    at: new Date().toISOString(),
  };
  completed.add(nextIdx);
  state.completed = [...completed].sort((a, b) => a - b);
  saveState(state);

  await updateDbState({
    status: 'idle', stage: null, total_fetched: state.total_fetched,
    total_inserted: state.total_fetched, total_llm_processed: state.total_llm_processed,
    total_llm_selected: state.total_llm_selected, total_llm_failed: state.total_llm_failed,
    rounds: state.rounds,
  });

  const remaining = state.total_groups - state.completed.length;
  console.log(`  剩余: ${remaining}组 | 累计精选: ${state.total_llm_selected}`);

  // 飞书汇报
  feishu(`【IP-HOT v2】组${nextIdx + 1}/${state.total_groups} ${names[0]}\n抓取:${inserted} | 噪音过滤:${noiseBlocked} | LLM:${llmStats.success}/${llmStats.selected}精 | 剩余${remaining}组`);

  return state;
}

// ── LLM-Only 模式 ──
async function llmOnlyLoop() {
  console.log('LLM-Only 模式：仅处理积压文章\n');
  let total = 0;
  await ensureDbState();

  while (true) {
    await updateDbState({ status: 'running', stage: 'llm' });
    const state = {
      total_llm_processed: 0, total_llm_selected: 0, total_llm_failed: 0,
      total_low_score_deleted: 0,
    };
    const llmStats = await llmProcessBatch(state);
    try {
      await persistQualityAudit(llmStats.qualityResults);
    } catch (e) {
      console.log(`  信源审计保存失败: ${(e.message || '').slice(0, 60)}`);
    }
    await deleteLowScore(state);
    total += llmStats.success;

    await updateDbState({
      status: 'idle', stage: null,
      total_llm_processed: state.total_llm_processed || total,
      total_llm_selected: state.total_llm_selected,
    });

    if (llmStats.success === 0) {
      console.log(`\n积压清空！累计 ${total} 条`);
      break;
    }
    console.log(`  本轮: ${llmStats.success} | 累计: ${total} | 等待30s...`);
    await sleep(30000);
  }
}

// ── 入口 ──
async function main() {
  await ensureDbState();

  if (process.argv.includes('--llm-only')) {
    await llmOnlyLoop();
    return;
  }

  let state = loadState();

  if (!state || process.argv.includes('--init')) {
    console.log('初始化统一流水线...');
    state = initPipeline();
    console.log(`  ${state.total_groups} 组, 共 ${state.groups.flat().length} 个信源`);
    await updateDbState({
      status: 'idle', total_groups: state.total_groups,
      started_at: state.started_at,
    });
    feishu(`【IP-HOT v2】统一流水线就绪，${state.total_groups}组共${state.groups.flat().length}个信源`);
  } else {
    console.log(`恢复进度: ${state.completed.length}/${state.total_groups}组 | 累计入库${state.total_fetched} | 精选${state.total_llm_selected}`);
  }

  // --once: 只跑一个组
  if (process.argv.includes('--once')) {
    // 支持 --group N 指定组号
    const gi = process.argv.indexOf('--group');
    if (gi !== -1 && gi + 1 < process.argv.length) {
      const targetIdx = parseInt(process.argv[gi + 1]) - 1;
      state.completed = state.completed.filter(i => i !== targetIdx);
    }
    await runGroup(state);
    console.log('\n单次运行结束。');
    return;
  }

  // 持续循环模式
  try {
    while (true) {
      state = await runGroup(state);
      const remaining = state.total_groups - state.completed.length;
      if (remaining === 0) {
        feishu(`【Claudecode完成】IP-HOT v2 第${state.rounds}轮完成！\n入库:${state.total_fetched} | 精选:${state.total_llm_selected} | 删分:${state.total_low_score_deleted}`);
        // 轮间休息 60-90 min
        const wait = Math.random() * 30 * 60 + 60 * 60;
        console.log(`等待${Math.round(wait / 60)}分钟后开始下一轮...`);
        await sleep(wait * 1000);
      } else {
        // 组间休息 5-10 min
        const wait = Math.random() * 5 * 60 + 5 * 60;
        console.log(`等待${Math.round(wait / 60)}分钟后处理下一组...`);
        await sleep(wait * 1000);
      }
    }
  } catch (e) {
    console.log('\n流水线中断:', e.message);
    feishu(`【IP-HOT v2 中断】${state.completed.length}/${state.total_groups}组。${(e.message || '').slice(0, 50)}`);
    saveState(state);
    await updateDbState({ status: 'error', error_message: (e.message || '').slice(0, 200) });
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
