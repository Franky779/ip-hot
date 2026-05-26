// scripts/fetch-zhihu-leibao.mjs
// 本地脚本：通过CDP抓取知乎雷报文章列表
// 支持Cookie持久化：首次登录后自动保存Cookie，后续抓取自动恢复登录态
// 依赖：Node.js 22+、Chrome CDP(9222)、lark-cli(飞书通知)

import http from 'http';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const LOG_DIR = join(PROJECT_DIR, '.claude', 'logs');
const COOKIE_DIR = join(PROJECT_DIR, '.claude', 'cookies');
const COOKIE_FILE = join(COOKIE_DIR, 'zhihu.json');
const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || '';
const FEISHU_USER_ID = 'ou_e75b9fb59fc6c5566f6823cf284e2ec6';
const CDP_PORT = 9222;
const CDP_HOST = '127.0.0.1';

// ============ 工具函数 ============

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

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

function sendFeishu(text) {
  try {
    execFileSync('lark-cli', ['--as', 'bot', 'im', '+messages-send', '--user-id', FEISHU_USER_ID, '--text', text], {
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (e) {
    log('飞书发送失败: ' + e.message);
    return false;
  }
}

// ============ Cookie 持久化 ============

/** 获取CDP WebSocket URL */
async function getCdpWsUrl() {
  try {
    const data = await cdpApi('/json/list');
    const tabs = JSON.parse(data);
    // 找一个可用的tab的webSocketDebuggerUrl
    const tab = tabs.find(t => t.webSocketDebuggerUrl);
    return tab?.webSocketDebuggerUrl || null;
  } catch (e) {
    log(`  获取CDP WS URL失败: ${e.message}`);
    return null;
  }
}

/** 通过WebSocket执行CDP命令 */
function cdpWsCommand(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = Date.now();
    let resolved = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ id, method, params }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          resolved = true;
          ws.close();
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {
        // ignore non-JSON messages
      }
    };

    ws.onerror = (err) => {
      if (!resolved) { resolved = true; reject(err); }
    };

    ws.onclose = () => {
      if (!resolved) { resolved = true; reject(new Error('WebSocket closed unexpectedly')); }
    };

    setTimeout(() => {
      if (!resolved) { resolved = true; ws.close(); reject(new Error('WebSocket timeout')); }
    }, 10000);
  });
}

/** 从浏览器提取知乎Cookie */
async function extractZhihuCookies(targetId) {
  try {
    // 先导航到知乎域名，确保能获取到该域的cookie
    const infoData = await cdpApi(`/info?target=${targetId}`);
    const info = JSON.parse(infoData);
    const currentUrl = info.url || '';

    // 如果当前不在知乎域名下，先打开知乎首页
    if (!currentUrl.includes('zhihu.com')) {
      await cdpApi(`/navigate?target=${targetId}&url=https://www.zhihu.com`);
      await sleep(5000);
    }

    // 通过WebSocket获取所有cookie
    const wsUrl = await getCdpWsUrl();
    if (!wsUrl) return null;

    const result = await cdpWsCommand(wsUrl, 'Network.getAllCookies');
    const allCookies = result?.cookies || [];

    // 只保留知乎相关的cookie
    const zhihuCookies = allCookies.filter(c =>
      c.domain.includes('zhihu.com') || c.domain.includes('zhimg.com')
    );

    log(`  提取到 ${zhihuCookies.length} 个知乎Cookie`);
    return zhihuCookies;
  } catch (e) {
    log(`  提取Cookie失败: ${e.message}`);
    return null;
  }
}

/** 保存Cookie到文件 */
function saveCookies(cookies) {
  try {
    if (!existsSync(COOKIE_DIR)) mkdirSync(COOKIE_DIR, { recursive: true });
    const data = {
      savedAt: new Date().toISOString(),
      cookies,
    };
    writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    log(`  Cookie已保存到 ${COOKIE_FILE}`);
    return true;
  } catch (e) {
    log(`  保存Cookie失败: ${e.message}`);
    return false;
  }
}

/** 从文件加载Cookie */
function loadCookies() {
  try {
    if (!existsSync(COOKIE_FILE)) return null;
    const data = JSON.parse(readFileSync(COOKIE_FILE, 'utf-8'));
    const savedAt = new Date(data.savedAt || 0);
    const daysAgo = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60 * 24);
    log(`  加载Cookie文件（${daysAgo.toFixed(1)}天前保存，${data.cookies?.length || 0}条）`);
    return data.cookies || null;
  } catch (e) {
    log(`  加载Cookie失败: ${e.message}`);
    return null;
  }
}

/** 通过WebSocket设置Cookie到浏览器 */
async function setCookiesToBrowser(cookies) {
  try {
    const wsUrl = await getCdpWsUrl();
    if (!wsUrl) {
      log('  无法获取CDP WebSocket URL，跳过设置Cookie');
      return false;
    }

    // 先启用Network domain
    await cdpWsCommand(wsUrl, 'Network.enable');

    let successCount = 0;
    for (const c of cookies) {
      try {
        await cdpWsCommand(wsUrl, 'Network.setCookie', {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure || false,
          httpOnly: c.httpOnly || false,
          sameSite: c.sameSite || undefined,
        });
        successCount++;
      } catch (e) {
        // 单个cookie设置失败继续
      }
    }
    log(`  成功设置 ${successCount}/${cookies.length} 个Cookie`);
    return successCount > 0;
  } catch (e) {
    log(`  设置Cookie失败: ${e.message}`);
    return false;
  }
}

// ============ 主流程 ============

async function main() {
  const startTime = Date.now();
  log('========== 知乎雷报抓取开始 ==========');

  // Step 1: 检查CDP可用性
  log('Step 1: 检查CDP...');
  let cdpOk = false;
  try {
    const versionResult = await cdpApi('/json/version');
    if (versionResult.includes('Browser')) {
      cdpOk = true;
      const info = JSON.parse(versionResult);
      log(`  CDP OK: ${info.Browser}`);
    }
  } catch (e) {
    log(`  CDP连接失败: ${e.message}`);
  }

  if (!cdpOk) {
    log('CDP不可用，终止');
    sendFeishu('【Claudecode失败】知乎雷报定时抓取\n失败原因：CDP不可用，Chrome未启动或远程调试端口(9222)未开启。');
    process.exit(1);
  }

  // Step 2: 创建新标签页
  log('Step 2: 创建标签页...');
  let targetId = '';
  try {
    const result = await cdpApi('/new?url=https://www.zhihu.com');
    const match = result.match(/[0-9A-F]{32}/);
    targetId = match ? match[0] : '';
    log(`  TargetId: ${targetId || 'FAIL'}`);
  } catch (e) {
    log(`  创建标签页失败: ${e.message}`);
    sendFeishu('【Claudecode失败】知乎雷报定时抓取\n失败原因：CDP创建标签页失败');
    process.exit(1);
  }

  // Step 3: 尝试加载已有Cookie恢复登录态
  const savedCookies = loadCookies();
  if (savedCookies && savedCookies.length > 0) {
    log('Step 3: 尝试用保存的Cookie恢复登录态...');
    await setCookiesToBrowser(savedCookies);
    await sleep(3000);
  } else {
    log('Step 3: 无保存的Cookie，需要手动登录');
  }

  // Step 4: 导航到知乎雷报页面
  log('Step 4: 打开知乎雷报文章页...');
  try {
    await cdpApi(`/navigate?target=${targetId}&url=https://www.zhihu.com/people/wanshangkansha/posts`);
  } catch (e) {
    log(`  导航失败: ${e.message}`);
  }
  await sleep(10000);

  // Step 5: 检查登录态
  log('Step 5: 检查登录态...');
  const loginCheck = await cdpApi(`/eval?target=${targetId}`, 'POST',
    'JSON.stringify({ loginNeeded: document.body.innerText.includes("请登录") || document.body.innerText.includes("登录") && document.body.innerText.includes("注册") && !document.querySelector("[data-za-detail-view-id=\"4314\"]"), title: document.title })'
  );
  let loginNeeded = true;
  let pageTitle = '';
  try {
    const parsed = JSON.parse(loginCheck);
    const val = parsed.value ? JSON.parse(parsed.value) : {};
    loginNeeded = val.loginNeeded !== false;
    pageTitle = val.title || '';
  } catch {}

  log(`  页面标题: ${pageTitle}`);

  // Step 6: 如果未登录，提醒用户
  if (loginNeeded) {
    log('  知乎未登录，发送提醒...');
    await cdpApi(`/close?target=${targetId}`);
    sendFeishu('【Claudecode提醒】知乎雷报抓取需要登录\n\n请在Chrome中打开 zhihu.com 并登录知乎账号。\n登录完成后，在Claude Code中回复"已登录"，我将重新尝试抓取。\n\n首次登录后，Cookie会自动保存，后续无需重复登录。');
    process.exit(1);
  }
  log('  登录态OK');

  // Step 7: 保存最新Cookie（用于下次自动登录）
  log('Step 6: 保存最新Cookie...');
  const freshCookies = await extractZhihuCookies(targetId);
  if (freshCookies && freshCookies.length > 0) {
    saveCookies(freshCookies);
  }

  // Step 8: 滚动加载文章
  log('Step 7: 滚动加载...');
  for (let i = 0; i < 3; i++) {
    await cdpApi(`/scroll?target=${targetId}&direction=bottom`);
    await sleep(4000 + Math.random() * 2000);
  }

  // Step 9: 提取文章列表
  log('Step 8: 提取文章...');
  const extractResult = await cdpApi(`/eval?target=${targetId}`, 'POST',
    'JSON.stringify(Array.from(document.querySelectorAll("a")).filter(a => a.href.includes("/p/")).slice(0,50).map(a => ({ title: a.textContent.trim().slice(0,100), url: a.href })))'
  );

  let articles = [];
  try {
    const parsed = JSON.parse(extractResult);
    articles = JSON.parse(parsed.value);
  } catch (e) {
    log(`  提取失败: ${e.message}`);
  }

  // 去重
  const seen = new Set();
  articles = articles.filter(a => {
    if (!a.title || !a.url) return false;
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  log(`  提取到 ${articles.length} 篇文章`);

  if (articles.length === 0) {
    await cdpApi(`/close?target=${targetId}`);
    sendFeishu('【Claudecode失败】知乎雷报定时抓取\n失败原因：未提取到文章');
    process.exit(1);
  }

  // Step 10: 入库Supabase
  log('Step 9: 入库Supabase...');
  let totalInserted = 0;
  const source = '知乎雷报';

  for (let i = 0; i < articles.length; i += 10) {
    const batch = articles.slice(i, i + 10).map(a => ({
      source,
      url: a.url,
      title: a.title,
      published_at: null,
    }));

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const data = await res.json().catch(() => []);
        totalInserted += Array.isArray(data) ? data.length : 0;
      }
    } catch (e) {
      log(`  入库批次${i/10+1}失败: ${e.message}`);
    }
    await sleep(300);
  }

  log(`  实际入库: ${totalInserted} 条`);

  // Step 11: 关闭标签页
  await cdpApi(`/close?target=${targetId}`);

  // Step 12: 发送完成通知
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`完成，耗时 ${elapsed}s`);
  sendFeishu(`【Claudecode完成】知乎雷报定时抓取\n- 提取：${articles.length} 篇\n- 入库：${totalInserted} 条\n- 耗时：${elapsed}s\n- Cookie已保存，下次自动登录`);
}

main().catch(e => {
  log('未捕获异常: ' + (e.message || e));
  try {
    sendFeishu(`【Claudecode失败】知乎雷报定时抓取\n失败原因：${e.message || e}`);
  } catch {}
  process.exit(1);
});
