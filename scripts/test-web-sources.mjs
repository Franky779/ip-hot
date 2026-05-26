// 测试所有网页抓取源
import http from 'http';
import { existsSync, readFileSync } from 'fs';

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

async function testSource(name, url, extractJs, waitMs = 12000) {
  log(`\n========== ${name} ==========`);
  try {
    const tab = await cdpApi('/new?url=' + encodeURIComponent(url));
    const id = (tab.match(/[0-9A-F]{32}/) || [''])[0];
    if (!id) { log('  tab创建失败'); return { ok: false, error: 'no tab' }; }
    await sleep(waitMs);

    // 检查页面状态
    const titleRes = await cdpApi(`/eval?target=${id}`, 'POST', 'document.title');
    const title = JSON.parse(titleRes).value;
    log(`  标题: ${title}`);

    const bodyLen = await cdpApi(`/eval?target=${id}`, 'POST', 'document.body.innerText.length');
    log(`  正文长度: ${JSON.parse(bodyLen).value}`);

    // 检查Google验证
    const captchaCheck = await cdpApi(`/eval?target=${id}`, 'POST',
      'document.body.innerText.includes("CAPTCHA") || document.body.innerText.includes("captcha") || document.querySelector("iframe[src*=\\"recaptcha\\"]") !== null || document.querySelector("#captcha") !== null || document.querySelector(".g-recaptcha") !== null'
    );
    const hasCaptcha = JSON.parse(captchaCheck).value;
    if (hasCaptcha) {
      log('  ⚠️ 需要手动通过Google验证');
      await cdpApi('/close?target=' + id);
      return { ok: false, error: 'captcha', targetId: id };
    }

    // 检查Cloudflare
    const cloudflareCheck = await cdpApi(`/eval?target=${id}`, 'POST',
      'document.title.includes("Cloudflare") || document.title.includes("Just a moment") || document.body.innerText.includes("Checking your browser")'
    );
    if (JSON.parse(cloudflareCheck).value) {
      log('  ⚠️ Cloudflare拦截');
      await cdpApi('/close?target=' + id);
      return { ok: false, error: 'cloudflare' };
    }

    // 提取文章
    const result = await cdpApi(`/eval?target=${id}`, 'POST', extractJs);
    let items = [];
    try {
      const val = JSON.parse(result).value;
      items = val ? JSON.parse(val) : [];
    } catch (e) { log(`  解析失败: ${e.message}`); }

    log(`  提取: ${items.length} 条`);
    items.slice(0, 3).forEach((a, i) => log(`    ${i + 1}. ${a.title?.slice(0, 60)}`));

    await cdpApi('/close?target=' + id);
    return { ok: true, items };
  } catch (e) {
    log(`  失败: ${e.message}`);
    return { ok: false, error: e.message };
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
const results = [];

async function main() {
  const startTime = Date.now();
  log('========== 网页源抓取测试开始 ==========');

  try { await cdpApi('/json/version'); log('CDP OK'); }
  catch (e) { log('CDP不可用，终止'); process.exit(1); }

  // 1. ANN（可能Google验证）
  let r = await testSource('ANN', 'https://www.animenewsnetwork.com/',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).filter(a => { const t = a.textContent.trim(); return t.length > 10 && t.length < 200 && a.href.includes("/news/") && !t.includes("view full") && !t.includes("Login") && !t.includes("Register"); }).slice(0,15).map(a => ({title: a.textContent.trim().slice(0,100), url: a.href})))',
    15000
  );
  results.push({ name: 'ANN', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Anime News Network');

  await sleep(5000);

  // 2. Crunchyroll
  r = await testSource('Crunchyroll', 'https://www.crunchyroll.com/news/latest',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 150 && x.h.includes("crunchyroll.com/news") && !x.h.includes("/latest")).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: 'Crunchyroll', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Crunchyroll News');

  await sleep(5000);

  // 3. AWN（可能Google验证）
  r = await testSource('AWN', 'https://www.awn.com/',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 10 && x.t.length < 150 && x.h.includes("awn.com/news") && !x.h.includes("/news/archive")).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: 'AWN', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Animation World Network');

  await sleep(5000);

  // 4. Polygon
  r = await testSource('Polygon', 'https://www.polygon.com/',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 15 && x.t.length < 150 && x.h.startsWith("https://www.polygon.com/") && !x.h.includes("/author/") && !x.h.includes("/about/") && !x.h.includes("/privacy") && !x.h.includes("/contact") && !x.h.includes("/subscribe")).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: 'Polygon', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Polygon');

  await sleep(5000);

  // 5. Anime Anime
  r = await testSource('Anime Anime', 'https://animeanime.jp/category/news/',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes("animeanime.jp") && (x.h.includes("/article/") || x.h.includes("/news/"))).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: 'Anime Anime', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Anime Anime');

  await sleep(5000);

  // 6. Famitsu
  r = await testSource('Famitsu', 'https://www.famitsu.com/category/news/page/1',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes("famitsu.com") && (x.h.includes("/article/") || x.h.includes("/news/"))).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: 'Famitsu', ...r });
  if (r.ok) await insertToSupabase(r.items, 'Famitsu');

  await sleep(5000);

  // 7. 虎嗅 channel/103
  r = await testSource('虎嗅-103', 'https://www.huxiu.com/channel/103.html',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes("huxiu.com/article/")).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: '虎嗅-103', ...r });
  if (r.ok) await insertToSupabase(r.items, '虎嗅');

  await sleep(5000);

  // 8. 虎嗅 channel/22
  r = await testSource('虎嗅-22', 'https://www.huxiu.com/channel/22.html',
    'JSON.stringify(Array.from(document.querySelectorAll("a[href]")).map(a => ({t: a.textContent.trim(), h: a.href})).filter(x => x.t.length > 5 && x.t.length < 100 && x.h.includes("huxiu.com/article/")).slice(0,15).map(x => ({title: x.t.slice(0,100), url: x.h})))',
    15000
  );
  results.push({ name: '虎嗅-22', ...r });
  if (r.ok) await insertToSupabase(r.items, '虎嗅');

  // 汇总
  log('\n========== 汇总 ==========');
  const success = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  log(`成功: ${success.length} 个`);
  success.forEach(s => log(`  ✓ ${s.name}: ${s.items?.length || 0} 条`));
  log(`失败: ${failed.length} 个`);
  failed.forEach(s => log(`  ✗ ${s.name}: ${s.error}`));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`总耗时: ${elapsed}s`);
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
