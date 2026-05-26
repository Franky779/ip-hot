// 用CDP批量检查WEB失败源的页面结构
import http from 'http';

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 3456;

const sources = [
  { id: 'ctoy', name: '中外玩具网', url: 'http://www.ctoy.com.cn' },
  { id: 'wjyt', name: '玩具产业网', url: 'https://www.wjyt-china.org/' },
  { id: 'lcexpo', name: 'LCEXPO', url: 'http://www.lcexpo.com.cn' },
  { id: 'ccdy', name: '中国文化报', url: 'http://www.ccdy.cn' },
  { id: 'sohu', name: '搜狐网', url: 'https://www.sohu.com' },
  { id: 'bjd', name: '京报网', url: 'https://www.bjd.com.cn' },
  { id: 'shxwcb', name: '新闻晨报', url: 'https://www.shxwcb.com' },
  { id: 'zjol', name: '浙江日报', url: 'http://www.zjol.com.cn' },
  { id: 'ycwb', name: '金羊网', url: 'https://www.ycwb.com' },
];

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

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkSource(src) {
  console.log(`\n=== ${src.name} (${src.url}) ===`);
  try {
    const newTab = await cdpApi(`/new?url=${encodeURIComponent(src.url)}`);
    const targetId = (newTab.match(/[0-9A-F]{32}/) || [''])[0];
    if (!targetId) { console.log('  newTab失败'); return; }

    await sleep(10000);

    // 检查标题
    const titleRes = await cdpApi(`/eval?target=${targetId}`, 'POST', 'document.title');
    const title = JSON.parse(titleRes).value;
    console.log(`  标题: ${title}`);

    // 查找新闻类链接
    const jsCode = `JSON.stringify(Array.from(document.querySelectorAll('a')).filter(a => {
      const h = a.href || '';
      const t = a.textContent.trim();
      return t.length > 5 && t.length < 100 && h.startsWith('http') &&
             (h.includes('/n/') || h.includes('/news') || h.includes('/article') || h.includes('/content') || h.includes('/detail') || h.includes('.html'));
    }).slice(0, 8).map(a => ({t: a.textContent.trim().slice(0, 50), h: a.href.slice(0, 80), parent: a.parentElement?.tagName})))`;

    const linksRes = await cdpApi(`/eval?target=${targetId}`, 'POST', jsCode);
    const linksRaw = JSON.parse(linksRes).value;
    const links = JSON.parse(linksRaw);
    console.log(`  找到 ${links.length} 条候选链接:`);
    for (const l of links.slice(0, 5)) {
      console.log(`    - ${l.t} | ${l.h} | parent:${l.parent}`);
    }

    await cdpApi(`/close?target=${targetId}`);
  } catch (e) {
    console.log(`  错误: ${e.message}`);
  }
}

async function main() {
  for (const src of sources) {
    await checkSource(src);
    await sleep(3000);
  }
}

main().catch(e => console.log('异常:', e.message));
