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

async function fetchAndInsert(name, url, sourceName, extractJs) {
  log(`\n========== ${name} ==========`);

  // 1. 提取
  const tab = await cdpApi('/new?url=' + encodeURIComponent(url));
  const id = (tab.match(/[0-9A-F]{32}/) || [''])[0];
  if (!id) { log('tab创建失败'); return; }
  await sleep(15000);

  const titleRes = await cdpApi(`/eval?target=${id}`, 'POST', 'document.title');
  log(`标题: ${JSON.parse(titleRes).value}`);

  const result = await cdpApi(`/eval?target=${id}`, 'POST', extractJs);
  let items = [];
  try {
    const val = JSON.parse(result).value;
    items = val ? JSON.parse(val) : [];
  } catch (e) { log(`解析失败: ${e.message}`); }

  // 过滤导航
  const navWords = ['Headline', 'Flash', 'Signup', 'view full', 'Login', 'Register', 'News', 'Season Lineup', 'Anime Awards', 'Mikikazu Komatsu', 'All Entertainment', 'Grand Theft Auto', 'アニメ一覧', '人気記事', '記事TOP', '全部文章'];
  items = items.filter(a => a.title && a.url && a.title.length > 10 && !navWords.some(w => a.title.includes(w)));
  log(`过滤后: ${items.length} 条`);
  items.slice(0, 5).forEach((a, i) => log(`  ${i + 1}. ${a.title.slice(0, 60)}`));
  await cdpApi('/close?target=' + id);

  // 2. 逐条入库
  log('开始入库...');
  let inserted = 0;
  let errors = 0;
  for (const item of items) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{
          source: sourceName, url: item.url, title: item.title, published_at: null,
          title_cn: item.title.slice(0, 100), summary_cn: '', category: '待分类', relevance_score: 5, is_selected: false, commentary: ''
        }]),
      });
      if (res.ok) {
        const d = await res.json().catch(() => []);
        inserted += Array.isArray(d) ? d.length : 0;
      } else {
        errors++;
        const err = await res.text();
        log(`  ✗ HTTP ${res.status}: ${err.slice(0, 200)} | URL: ${item.url.slice(0, 60)}`);
      }
    } catch (e) {
      errors++;
      log(`  ✗ 异常: ${e.message} | URL: ${item.url.slice(0, 60)}`);
    }
    await sleep(100);
  }
  log(`入库完成: ${inserted} 条成功, ${errors} 条失败`);
}

async function main() {
  log('========== AWN/Famitsu 排查开始 ==========');
  try { await cdpApi('/json/version'); log('CDP OK'); } catch (e) { log('CDP不可用'); return; }

  // AWN
  await fetchAndInsert('AWN', 'https://www.awn.com/', 'Animation World Network',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 150 && !x.t.includes('Headline') && !x.t.includes('Flash') && !x.t.includes('Signup')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );

  await sleep(5000);

  // Famitsu
  await fetchAndInsert('Famitsu', 'https://www.famitsu.com/category/news/page/1', 'Famitsu',
    "JSON.stringify(Array.from(document.querySelectorAll('a[href*=\"/article/\"], a[href*=\"/news/\"]')).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes('famitsu.com')).slice(0,20).map(x => ({title: x.t.slice(0,100), url: x.h})))"
  );

  log('\n========== 完成 ==========');
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
