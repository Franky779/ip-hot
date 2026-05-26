// 批量抓取修复后的源并入库
import http from 'http';
import { readFileSync } from 'fs';

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

async function fetchSource(name, url, extractJs, waitMs = 12000) {
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

    // 过滤和去重
    const seen = new Set();
    items = items.filter(a => {
      if (!a.title || !a.url) return false;
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      // 过滤导航链接
      const navWords = ['Upgrade to Premium', 'Season Lineup', 'Anime Awards', 'view full', 'Login', 'Register', 'Account', 'Subscribe', 'Sign In', 'Archive', 'Xchange'];
      if (navWords.some(w => a.title.includes(w))) return false;
      return a.title.length > 10;
    });

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
  for (const item of articles) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{
          source, url: item.url, title: item.title, published_at: null,
          title_cn: item.title.slice(0, 100), summary_cn: '', category: '待分类', relevance_score: 5, is_selected: false, commentary: ''
        }]),
      });
      if (res.ok) {
        const d = await res.json().catch(() => []);
        inserted += Array.isArray(d) ? d.length : 0;
      }
    } catch (e) { /* ignore single item failure */ }
    await sleep(50);
  }
  return inserted;
}

// ============ 主流程 ============
async function main() {
  const startTime = Date.now();
  log('========== 修复源批量抓取开始 ==========');

  try { await cdpApi('/json/version'); log('CDP OK'); }
  catch (e) { log('CDP不可用'); process.exit(1); }

  const results = [];

  // 1. 澎湃新闻
  let items = await fetchSource('澎湃新闻', 'https://www.thepaper.cn/channel_143013',
    `JSON.stringify(Array.from(document.querySelectorAll('a[href*="/newsDetail_forward_"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100).slice(0, 15).map(x => ({title: x.t.slice(0, 100), url: x.h})))`
  );
  let n = await insertToSupabase(items, '澎湃新闻');
  results.push({ name: '澎湃新闻', count: items.length, inserted: n });
  await sleep(5000);

  // 2. KidScreen
  items = await fetchSource('KidScreen', 'https://kidscreen.com/',
    `(() => { const articles = []; document.querySelectorAll('a').forEach(a => { const h = a.href; if (!h.includes('kidscreen.com') || !h.match(/\/\d{4}\/\d{2}\/\d{2}\//)) return; if (h.includes('/category/') || h.includes('/tag/') || h.includes('/author/') || h.includes('/account/')) return; const parts = a.textContent.trim().split('\\n').map(s => s.trim()).filter(s => s.length > 0); const title = parts[parts.length - 1] || ''; if (title.length > 10 && title.length < 200) articles.push({title: title.slice(0, 100), url: h}); }); const seen = new Set(); return JSON.stringify(articles.filter(x => { if (seen.has(x.url)) return false; seen.add(x.url); return true; }).slice(0, 15)); })()`
  );
  n = await insertToSupabase(items, 'KidScreen');
  results.push({ name: 'KidScreen', count: items.length, inserted: n });
  await sleep(5000);

  // 3. CBR
  items = await fetchSource('CBR', 'https://www.cbr.com/category/anime/',
    `JSON.stringify(Array.from(document.querySelectorAll('h2, h3')).map(h => ({t: h.textContent.trim(), a: h.closest('a') || h.querySelector('a')})).filter(x => x.t.length > 20 && x.t.length < 150 && x.a).map(x => ({title: x.t.slice(0, 100), url: x.a.href})).slice(0, 15))`
  );
  n = await insertToSupabase(items, 'CBR');
  results.push({ name: 'CBR', count: items.length, inserted: n });
  await sleep(5000);

  // 4. 金羊网文娱
  items = await fetchSource('金羊网文娱', 'https://ent.ycwb.com/',
    `JSON.stringify(Array.from(document.querySelectorAll('a[href*="content_"], a[href*="/ent/"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100).slice(0, 15).map(x => ({title: x.t.slice(0, 100), url: x.h})))`
  );
  n = await insertToSupabase(items, '金羊网');
  results.push({ name: '金羊网文娱', count: items.length, inserted: n });
  await sleep(5000);

  // 5. Crunchyroll
  items = await fetchSource('Crunchyroll', 'https://www.crunchyroll.com/news/latest',
    `(() => { const articles = []; const seen = new Set(); document.querySelectorAll('a[href*="/news/"]').forEach(a => { const h2 = a.querySelector('h2, h3'); const title = (h2 ? h2.textContent.trim() : a.textContent.trim()).slice(0, 100); const url = a.href; if (title.length > 15 && url.includes('crunchyroll.com') && !seen.has(url)) { seen.add(url); articles.push({title, url}); } }); return JSON.stringify(articles.slice(0, 15)); })()`
  );
  n = await insertToSupabase(items, 'Crunchyroll News');
  results.push({ name: 'Crunchyroll', count: items.length, inserted: n });

  // 汇总
  log('\n========== 汇总 ==========');
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  results.forEach(r => log(`${r.name}: ${r.count}条, 入库${r.inserted}条`));
  log(`总入库: ${totalInserted} 条`);
  log(`耗时: ${Math.round((Date.now() - startTime) / 1000)}s`);
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
