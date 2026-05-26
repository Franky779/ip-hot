// 监控LLM处理进度，每15分钟检查一次
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

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
const FEISHU_USER_ID = 'ou_e75b9fb59fc6c5566f6823cf284e2ec6';

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`); }

async function querySupabase() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Prefer': 'count=exact' };

  const pendingRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?category=eq.待分类&select=id`, {
    headers, method: 'HEAD'
  });
  const pendingCount = pendingRes.ok ? pendingRes.headers.get('content-range')?.split('/')[1] || 0 : '查询失败';

  const processedRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?title_cn=not.is.null&select=id`, {
    headers, method: 'HEAD'
  });
  const processedCount = processedRes.ok ? processedRes.headers.get('content-range')?.split('/')[1] || 0 : '查询失败';

  const totalRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id`, {
    headers, method: 'HEAD'
  });
  const totalCount = totalRes.ok ? totalRes.headers.get('content-range')?.split('/')[1] || 0 : '查询失败';

  return { pendingCount, processedCount, totalCount };
}

function sendFeishu(text) {
  try {
    const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    execSync(`lark-cli --as bot im +messages-send --user-id "${FEISHU_USER_ID}" --text "${escaped}"`, {
      timeout: 15000, stdio: ['ignore', 'pipe', 'pipe']
    });
    return true;
  } catch (e) {
    log('飞书发送失败: ' + e.message);
    return false;
  }
}

async function checkAndReport(isStartup = false) {
  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const data = await querySupabase();

  let status;
  if (isStartup) {
    status = `【Claudecode LLM监控】${now} 启动报告\n`;
  } else {
    status = `【Claudecode LLM监控】${now} 进度报告\n`;
  }

  status += `📊 数据库状态:\n`;
  status += `  总文章: ${data.totalCount} 条\n`;
  status += `  待分类: ${data.pendingCount} 条\n`;
  status += `  已处理: ${data.processedCount} 条\n`;

  if (data.pendingCount === 0 || data.pendingCount === '查询失败') {
    status += `\n✅ LLM处理已完成或暂无待处理文章`;
  } else {
    status += `\n🔄 还有 ${data.pendingCount} 篇文章待LLM处理`;
  }

  log(status);
  sendFeishu(status);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'report';
  await checkAndReport(mode === 'startup');
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
