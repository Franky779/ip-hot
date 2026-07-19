// scripts/fetch-cdp-local.mjs
// 本地CDP脚本：抓取JS渲染页面（无需登录）
// 覆盖：微博热搜、知乎热榜
// 由 Windows schtasks 每小时触发，或手动 node 执行
// 依赖：Node.js 22+、Chrome CDP(9222)

import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// 加载 .env.local（独立脚本不自动读取）
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(resolve(process.cwd(), '.env.local'));

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 3456;
const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';

// LLM 配置（抓取后立即翻译/分类/评分）
const LLM_BASE_URL = process.env.LLM_BASE_URL || '';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-5-mini';
const LLM_ENABLED = LLM_BASE_URL && LLM_API_KEY;

// LLM 备选（DeepSeek，Anthropic 协议）
const LLM_BACKUP_URL = process.env.LLM_BACKUP_URL || '';
const LLM_BACKUP_KEY = process.env.LLM_BACKUP_KEY || '';
const LLM_BACKUP_MODEL = process.env.LLM_BACKUP_MODEL || 'deepseek-chat';

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cdpApi(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = { hostname: CDP_HOST, port: CDP_PORT, path, method, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {} };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ============ LLM 处理 ============
const SYSTEM_PROMPT = `你是一位数字创意产业新闻编辑。本站定位：专注动漫 / IP / 潮玩谷子 / 文创 / 文旅 / 博物馆 / 旅游纪念品 / 数字创意产业等多元资讯聚合。
请对以下新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/商业/文旅角度
3. 从以下7个分类中选一个最贴切的：
   - 新作发布：动漫/游戏/IP的新作品、新动画、新游戏发布
   - IP/品牌/授权：IP/品牌/授权合作、品牌联名、授权案例、商业合作
   - 潮玩谷子：潮玩、盲盒、谷子、手办等实物商品及相关品牌动态
   - 影视综艺：动漫改编电影/剧集、游戏改编影视、漫画改编影视、IP衍生影视内容、虚拟偶像综艺
   - 展会活动：行业展会、活动、市集、发布会、展览
   - 文旅及商品：文旅项目、博物馆IP、旅游纪念品、主题公园、城市IP、文旅商品、景区联名、文化遗产数字化
   - 待分类：无法明确归入以上6类的资讯，等待人工复核
4. 给出 0-10 的产业匹配度评分。评分极其严格，以下类别一律给 0-3 分（直接淘汰）：
   - 纯AI/人工智能资讯、纯财经/股市资讯、纯科技/硬件资讯、纯政治/社会政策、纯医疗健康
   - 纯 Hollywood 真人剧集/电影评论（非动漫/游戏/IP改编的影视内容）
   - 纯餐饮/零售日常动态
5. 如果产业匹配度评分 >= 8，标记为精选（is_selected = true）
6. 用一句话给出你的行业解读（犀利、有洞察、带观点，20字以内），不要加署名

【特别约束 — 争议性内容处理】
以下内容无论产业匹配度评分多高，一律强制归类为"待分类"，等待人工审核：
- 中国统一、台湾问题、香港问题、新疆问题、西藏问题等国家主权和领土完整相关议题
- 政治敏感话题、意识形态争论、政府体制批评、选举相关
- LGBT、性别认同、性取向、跨性别、同性婚姻等有社会争议的话题
- 宗教极端主义、民族分裂、种族主义相关内容
- 战争、军事冲突、武器扩散等敏感国际议题
- 其他可能引发政治或社会争议、不符合中国大陆主流价值观的话题

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}`

const CATEGORIES = ['新作发布', 'IP/品牌/授权', '潮玩谷子', '影视综艺', '展会活动', '文旅及商品', '待分类'];

function extractJson(raw) {
  const startIdx = raw.indexOf('{');
  const endIdx = raw.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  try { return JSON.parse(raw.slice(startIdx, endIdx + 1)); } catch { return null; }
}

async function callLLM(title, useBackup = false) {
  const baseUrl = useBackup ? LLM_BACKUP_URL : LLM_BASE_URL;
  const apiKey = useBackup ? LLM_BACKUP_KEY : LLM_API_KEY;
  const model = useBackup ? LLM_BACKUP_MODEL : LLM_MODEL;
  const provider = useBackup ? 'DeepSeek' : 'Kimi';

  if (!baseUrl || !apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: `标题: ${title}` }], temperature: 0.2, max_tokens: 500 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      log(`  ${provider} 错误 ${res.status}`);
      if (!useBackup && LLM_BACKUP_URL && LLM_BACKUP_KEY) {
        log('  切换到 DeepSeek...');
        return callLLM(title, true);
      }
      return null;
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const parsed = extractJson(raw);

    if (!parsed) {
      log(`  ${provider} 返回无法解析`);
      if (!useBackup && LLM_BACKUP_URL && LLM_BACKUP_KEY) {
        log('  切换到 DeepSeek...');
        return callLLM(title, true);
      }
      return null;
    }

    return parsed;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') log(`  ${provider} 超时`);
    else log(`  ${provider} 异常: ${e.message}`);

    if (!useBackup && LLM_BACKUP_URL && LLM_BACKUP_KEY) {
      log('  切换到 DeepSeek...');
      return callLLM(title, true);
    }
    return null;
  }
}

async function processWithLLM(article) {
  const parsed = await callLLM(article.title);
  if (!parsed) return null;

  const category = CATEGORIES.includes(parsed.category) ? parsed.category : '待分类';
  const score = Math.min(10, Math.max(0, Number(parsed.relevance_score) || 5));

  return {
    title_cn: String(parsed.title_cn || article.title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score: score,
    is_selected: score >= 8,
    commentary: String(parsed.commentary || '').replace(/[\s—–-]{0,3}贾田点评$/g, '').replace(/[\s—–-]{0,3}推荐理由$/g, '').slice(0, 100),
  };
}

// ============ 抓取逻辑 ============
async function fetchAndExtract(sources) {
  const results = [];
  for (const src of sources) {
    log(`抓取: ${src.name}`);
    try {
      const newTab = await cdpApi(`/new?url=${src.url}`);
      const targetId = (newTab.match(/[0-9A-F]{32}/) || [''])[0];
      await sleep(src.loadWait || 10000);

      // 滚动触发加载
      if (src.needsScroll) {
        for (let s = 0; s < 3; s++) {
          await cdpApi(`/scroll?target=${targetId}&direction=bottom`);
          await sleep(5000);
        }
      } else {
        await cdpApi(`/scroll?target=${targetId}&y=2000`);
        await sleep(3000);
      }

      const selectorStr = JSON.stringify(src.selector);
      const jsCode = `JSON.stringify(Array.from(document.querySelectorAll(${selectorStr})).slice(0,${src.maxItems || 15}).map(el => { const a = el.tagName === 'A' ? el : el.querySelector('a'); return { title: (el.textContent || a?.textContent || '').trim().slice(0,100), url: (el.href || a?.href || '') }; }))`;
      log(`  targetId=${targetId}`);
      log(`  eval JS: ${jsCode.slice(0, 120)}...`);
      const extracted = await cdpApi(`/eval?target=${targetId}`, 'POST', jsCode);

      let articles = [];
      try {
        const parsed = JSON.parse(extracted);
        articles = JSON.parse(parsed.value);
      } catch {}

      // 过滤
      articles = articles.filter(a => a.title && a.url && a.title.length > 2);
      log(`  提取: ${articles.length} 条`);

      await cdpApi(`/close?target=${targetId}`);
      results.push({ source: src.name, articles });
    } catch (e) {
      log(`  失败: ${e.message}`);
      results.push({ source: src.name, articles: [], error: e.message });
    }
    await sleep(3000 + Math.random() * 4000);
  }
  return results;
}

async function insertSupabase(articles, source) {
  if (!articles.length) return 0;
  // 按URL去重
  const seen = new Set();
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10).map(a => {
      const row = { source, url: a.url, title: a.title, published_at: null };
      if (a.title_cn) {
        row.title_cn = a.title_cn;
        row.summary_cn = a.summary_cn;
        row.category = a.category;
        row.relevance_score = a.relevance_score;
        row.is_selected = a.is_selected;
        row.commentary = a.commentary;
      }
      return row;
    });
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        const count = Array.isArray(data) ? data.length : 0;
        inserted += count;
        if (count === 0) log(`  入库返回空数据: ${batch.length} 条提交`);
      } else {
        const errText = await res.text().catch(() => '');
        log(`  入库失败 HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
    } catch (e) { log(`  upsert error: ${e.message}`); }
    await sleep(200);
  }
  return inserted;
}

// ============ 源配置 ============
// selector 命中后直接提取 href and textContent
let SOURCES = [
  {
    name: '微博热搜',
    url: 'https://s.weibo.com/top/summary',
    selector: 'td.td-02 a, a[href*="/weibo?"]',
    maxItems: 20,
    loadWait: 10000,
  },
  {
    name: '知乎热榜',
    url: 'https://www.zhihu.com/hot',
    selector: 'a[href*="/question/"]',
    maxItems: 15,
    loadWait: 12000,
  },
  {
    name: '澎湃新闻',
    url: 'https://www.thepaper.cn/list_25462',
    selector: 'h2 a, h3 a',
    maxItems: 10,
    loadWait: 10000,
  },
  {
    name: 'ScreenRant',
    url: 'https://screenrant.com/category/anime/',
    selector: 'h3 a[href]',
    maxItems: 10,
    loadWait: 20000,
    needsScroll: true,
  },
  {
    name: 'CBR',
    url: 'https://www.cbr.com/category/anime/',
    selector: 'h3 a[href]',
    maxItems: 10,
    loadWait: 20000,
    needsScroll: true,
  },
  {
    name: 'License Global',
    url: 'https://www.licenseglobal.com/latest-news',
    selector: '.VerticalCard-Title_displayOption_default',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: 'KidScreen',
    url: 'https://kidscreen.com/category/screen/',
    selector: 'h2 a, h3 a, article a[href*="/202"], .entry-title a',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: 'Licensing International',
    url: 'https://www.licensing.org.cn/news/inside-licensing',
    selector: 'h2.entry-title a',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-产业',
    url: 'https://www.ctoy.com.cn/n/c3990/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-公司',
    url: 'https://www.ctoy.com.cn/n/c3993/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-渠道',
    url: 'https://www.ctoy.com.cn/n/c3991/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-授权',
    url: 'https://www.ctoy.com.cn/n/c4009/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-消费',
    url: 'https://www.ctoy.com.cn/n/c3992/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中外玩具网-潮玩',
    url: 'https://www.ctoy.com.cn/n/c4053/',
    selector: 'a[href*="/n/d"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '玩具产业网',
    url: 'https://www.wjyt-china.org/',
    selector: 'a[href*="detail?id="]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '中国文化报',
    url: 'http://www.ccdy.cn',
    selector: 'a[href*="/details/"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '新闻晨报',
    url: 'https://www.shxwcb.com',
    selector: 'a[href*="/detail/"]',
    maxItems: 10,
    loadWait: 15000,
  },
  {
    name: '金羊网',
    url: 'https://www.ycwb.com',
    selector: 'a[href*="content_"]',
    maxItems: 10,
    loadWait: 15000,
  },
];

const requestedIndex = Number(process.argv[2]);
if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < SOURCES.length) {
  SOURCES = [SOURCES[requestedIndex]];
}

// ============ 主流程 ============
async function main() {
  const startTime = Date.now();
  log('========== CDP本地源抓取开始 ==========');

  // 1. 检查CDP
  try {
    await cdpApi('/json/version');
    log('CDP OK');
  } catch (e) {
    log('CDP不可用，跳过');
    process.exit(0);
  }

  // 2. 抓取
  const results = await fetchAndExtract(SOURCES);

  // 3. LLM处理（翻译/分类/评分）→ 入库
  let totalInserted = 0;
  let totalFiltered = 0;
  for (const r of results) {
    let articles = r.articles;

    // LLM 处理（分批并行，每批3条）
    if (LLM_ENABLED && articles.length > 0) {
      log(`LLM处理 ${r.source}: ${articles.length} 条`);
      const processed = [];
      for (let i = 0; i < articles.length; i += 3) {
        const batch = articles.slice(i, i + 3);
        const batchResults = await Promise.all(batch.map(a => processWithLLM(a)));
        for (let j = 0; j < batch.length; j++) {
          const llm = batchResults[j];
          if (!llm) {
            processed.push(batch[j]); // LLM失败，保留原文
          } else if (llm.relevance_score < 4) {
            log(`  过滤低分: ${batch[j].title.slice(0,30)} (score=${llm.relevance_score})`);
            totalFiltered++;
          } else {
            processed.push({ ...batch[j], ...llm });
          }
        }
      }
      articles = processed;
    }

    const n = await insertSupabase(articles, r.source);
    log(`入库 ${r.source}: ${n} 条`);
    totalInserted += n;
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`完成: 总入库 ${totalInserted} 条, 过滤 ${totalFiltered} 条, 耗时 ${elapsed}s`);
}

main().catch(e => { log('异常: ' + (e.message || e)); process.exit(1); });
