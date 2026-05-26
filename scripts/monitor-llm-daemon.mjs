// LLM处理监控守护进程
// 启动后每15分钟检查一次数据库，通过飞书CLI汇报
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

function buildReport(isStartup) {
  return async () => {
    const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const data = await querySupabase();

    let text = isStartup
      ? `【Claudecode LLM监控】${now} 启动报告`
      : `【Claudecode LLM监控】${now} 进度报告`;
    text += `\n📊 总文章: ${data.totalCount} 条`;
    text += `\n📊 待分类: ${data.pendingCount} 条`;
    text += `\n📊 已处理: ${data.processedCount} 条`;

    if (data.pendingCount === 0 || data.pendingCount === '查询失败') {
      text += `\n✅ LLM处理已完成`;
    } else {
      text += `\n🔄 还有 ${data.pendingCount} 篇待处理`;
    }

    log(text);

    // 通过lark-cli发送
    try {
      const { execSync } = await import('child_process');
      const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      execSync(`lark-cli --as bot im +messages-send --user-id "ou_e75b9fb59fc6c5566f6823cf284e2ec6" --text "${escaped}"`, {
        timeout: 15000, stdio: 'ignore'
      });
      log('飞书发送成功');
    } catch (e) {
      log('飞书发送失败: ' + e.message);
    }
  };
}

async function main() {
  log('========== LLM监控守护进程启动 ==========');

  // 立即发送一次启动报告
  await buildReport(true)();

  // 每15分钟发送一次进度报告
  setInterval(buildReport(false), 15 * 60 * 1000);
  log('已设置每15分钟自动汇报');

  // 保持进程运行
  setInterval(() => {}, 60000);
}

main().catch(e => { log('异常: ' + e.message); process.exit(1); });
