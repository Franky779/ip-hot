// 修复版网页源抓取脚本 - 过滤导航链接
import http from 'http';
import { readFileSync, existsSync } from 'fs';

function loadEnvFile(fp) {
  try {
    const content = readFileSync(fp, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnvFile('./.env.local');

const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`); }

function cdpApi(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3456, path, method, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {} }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 导航链接关键词黑名单
const NAV_KEYWORDS = ['News', 'view full', 'Headline', 'Season Lineup', 'Anime Awards', 'Login', 'Register',
  'All Entertainment', 'Grand Theft Auto', 'アニメ一覧', '人気記事', 'view archive', 'Flash Newsletter',
  'Mikikazu Komatsu', '全部文章', '更多', '查看更多', '下一页', '上一页', '首页'];

function isNavLink(title) {
  if (!title || title.length < 15) return true;
  const t = title.toLowerCase();
  for (const kw of NAV_KEYWORDS) {
    if (title.includes(kw)) return true;
  }
  return false;
}

async function fetchAndExtract(name, url, extractJs, waitMs = 15000) {
  log(`\n========== ${name} ==========`);
  try {
    const tab = await cdpApi('/new?url=' + encodeURIComponent(url));
    const id = (tab.match(/[0-9A-F]{32}/) || [''])[0];
    if (!id) { log('  tab创建失败'); return []; }
    await sleep(waitMs);

    const titleRes = await cdpApi(`/eval?target=${id}`, 'POST', 'document.title');
    log(`  标题: ${JSON.parse(titleRes).value}`);

    const result = await cdpApi(`/eval?target=${id}`, 'POST', extractJs);
    let items = [];
    try {
      const val = JSON.parse(result).value;
      items = val ? JSON.parse(val) : [];
    } catch (e) { log(`  解析失败: ${e.message}`); }

    // 过滤导航链接
    items = items.filter(a => a.title && a.url && !isNavLink(a.title));
    log(`  过滤后: ${items.length} 条`);
    items.slice(0, 5).forEach((a, i) => log(`    ${i + 1}. ${a.title.slice(0, 60)}`));

    await cdpApi('/close?target=' + id);
    return items;
  } catch (e) {
    log(`  失败: ${e.message}`);
    return [];
  }
}

async function insertToSupabase(articles, source) {
  if (!articles.length) return 0;
  if (!SUPABASE_KEY) { log('  缺少SUPABASE_SECRET_KEY'); return 0; }
  let inserted = 0;
  for (let i = 0; i < articles.length; i += 10) {
    const batch = articles.slice(i, i + 10).map(a => ({
      source, url: a.url, title: a.title, published_at: null,
      title_cn: a.title?.slice(0, 100), summary_cn: '', category: '待分类',
      relevance_score: 5, is_selected: false, commentary: ''
    }));
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const d = await res.json().catch(() => []);
        inserted += Array.isArray(d) ? d.length : 0;
      }
    } catch (e) { log(`  入库失败: ${e.message}`); }
  }
  return inserted;
}

// ============ 主流程 ============
async function main() {
  const startTime = Date.now();
  log('========== 网页源抓取v2开始 ==========');

  try { await cdpApi('/json/version'); log('CDP OK'); }
  catch (e) { log('CDP不可用'); process.exit(1); }

  const results = [];

  // 1. ANN
  let items = await fetchAndExtract('ANN', 'https://www.animenewsnetwork.com/',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 200 && !x.t.includes('view full') && !x.t.includes('Login') && !x.t.includes('Register') && !x.t.includes('News')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  let n = await insertToSupabase(items, 'Anime News Network');
  results.push({ name: 'ANN', count: items.length, inserted: n });
  await sleep(5000);

  // 2. Crunchyroll
  items = await fetchAndExtract('Crunchyroll', 'https://www.crunchyroll.com/news/latest',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 150 && x.h.includes('crunchyroll.com/news') && !x.h.includes('/latest') && !x.t.includes('Season') && !x.t.includes('Awards')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, 'Crunchyroll News');
  results.push({ name: 'Crunchyroll', count: items.length, inserted: n });
  await sleep(5000);

  // 3. AWN
  items = await fetchAndExtract('AWN', 'https://www.awn.com/',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 150 && !x.t.includes('Headline') && !x.t.includes('Flash') && !x.t.includes('Signup') && !x.t.includes('News')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, 'Animation World Network');
  results.push({ name: 'AWN', count: items.length, inserted: n });
  await sleep(5000);

  // 4. Polygon
  items = await fetchAndExtract('Polygon', 'https://www.polygon.com/',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 15 && x.t.length < 150 && x.h.startsWith('https://www.polygon.com/') && !x.h.includes('/author/') && !x.h.includes('/about/') && !x.h.includes('/privacy') && !x.h.includes('/contact') && !x.h.includes('/subscribe') && !x.h.includes('/entertainment/') && !x.t.includes('All') && !x.t.includes('Entertainment')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, 'Polygon');
  results.push({ name: 'Polygon', count: items.length, inserted: n });
  await sleep(5000);

  // 5. Anime Anime
  items = await fetchAndExtract('Anime Anime', 'https://animeanime.jp/category/news/',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/article/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && !x.t.includes('一覧') && !x.t.includes('TOP') && !x.t.includes('記事')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, 'Anime Anime');
  results.push({ name: 'Anime Anime', count: items.length, inserted: n });
  await sleep(5000);

  // 6. Famitsu
  items = await fetchAndExtract('Famitsu', 'https://www.famitsu.com/category/news/page/1',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/article/\"], a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes('famitsu.com')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, 'Famitsu');
  results.push({ name: 'Famitsu', count: items.length, inserted: n });
  await sleep(5000);

  // 7. 虎嗅-103
  items = await fetchAndExtract('虎嗅-103', 'https://www.huxiu.com/channel/103.html',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/article/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, '虎嗅');
  results.push({ name: '虎嗅-103', count: items.length, inserted: n });
  await sleep(5000);

  // 8. 虎嗅-22
  items = await fetchAndExtract('虎嗅-22', 'https://www.huxiu.com/channel/22.html',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/article/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && !x.t.includes('小时前')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );
  n = await insertToSupabase(items, '虎嗅');
  results.push({ name: '虎嗅-22', count: items.length, inserted: n });

  // 汇总
  log('\n========== 汇总 ==========');
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  results.forEach(r => log(`${r.name}: ${r.count}条, 入库${r.inserted}条`));
  log(`总入库: ${totalInserted} 条`);
  log(`耗时: ${Math.round((Date.now() - startTime) / 1000)}s`);
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
