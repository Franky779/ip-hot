// 隐藏后台 LLM 队列守护程序。由 Windows 计划任务在系统启动时运行一次。
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import net from 'net';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readRegistrySecret() {
  if (process.platform !== 'win32') return '';
  try {
    const output = execFileSync(
      'reg.exe',
      ['query', 'HKLM\\SOFTWARE\\IPHot', '/v', 'WorkerSecret'],
      { encoding: 'utf8', windowsHide: true }
    );
    return output.match(/WorkerSecret\s+REG_SZ\s+(.+)/)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));

const ENDPOINT = process.env.LLM_WORKER_URL || 'https://hot.laojia-ip.com/api/cron/process-llm';
const CRON_SECRET = process.env.LLM_WORKER_SECRET || process.env.CRON_SECRET || readRegistrySecret();
const NORMAL_INTERVAL_MS = 3 * 60 * 1000;
const BACKLOG_INTERVAL_MS = 5 * 1000;
const BACKLOG_THRESHOLD = 200;
const LOCK_PORT = 3462;
const LOG_DIR = resolve(process.env.PROGRAMDATA || process.cwd(), 'ip-hot');
const LOG_FILE = resolve(LOG_DIR, 'llm-worker.log');

mkdirSync(LOG_DIR, { recursive: true });

function log(message) {
  if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > 2 * 1024 * 1024) {
    writeFileSync(LOG_FILE, '', 'utf8');
  }
  appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function processBatch() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 115000);
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error || 'unknown error'}`);
    if (body.skipped) {
      log(`跳过：已有任务运行中 (${body.reason || 'locked'})`);
      return NORMAL_INTERVAL_MS;
    }
    const remaining = Number(body.remaining || 0);
    log(`完成：处理 ${body.processed || 0}/${body.total || 0}，失败 ${body.failed || 0}，剩余 ${remaining}`);
    return remaining > BACKLOG_THRESHOLD ? BACKLOG_INTERVAL_MS : NORMAL_INTERVAL_MS;
  } catch (error) {
    log(`失败：${error instanceof Error ? error.message : String(error)}`);
    return NORMAL_INTERVAL_MS;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!CRON_SECRET) {
    log('启动失败：未配置 CRON_SECRET');
    process.exit(1);
  }

  const lock = net.createServer();
  lock.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      log('已有守护程序运行，本实例退出');
      process.exit(0);
    }
    log(`进程锁失败：${error.message}`);
    process.exit(1);
  });
  await new Promise((resolveListen) => lock.listen(LOCK_PORT, '127.0.0.1', resolveListen));
  log('LLM 后台守护程序启动');

  while (true) {
    const delay = await processBatch();
    await sleep(delay);
  }
}

main().catch((error) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
