// 初次推送 ip-hot 全部 git-tracked 文件到 GitHub Franky779/ip-hot 的 main 分支
// 适配 github.com:443 不可达但 api.github.com 可达的网络环境
// 适配空仓库 (auto_init=false): 先 PUT contents/README.md 触发仓库初始化,再用 blobs API 推剩余文件
//
// 用法: node _init_push.mjs
// 必需环境变量: GITHUB_TOKEN

import { readFileSync } from 'fs';
import { request } from 'https';
import { execSync } from 'child_process';

const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN not set'); process.exit(1); }

const OWNER = 'Franky779';
const REPO = 'ip-hot';
const BRANCH = 'main';

const allFiles = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
console.log(`要推送的文件数: ${allFiles.length}`);

// README.md 用 PUT contents 单独传(初始化仓库),其余文件走 blobs API
const initFile = 'README.md';
const otherFiles = allFiles.filter(f => f !== initFile);
if (!allFiles.includes(initFile)) {
  console.error(`未找到 ${initFile},无法用作初始化文件`);
  process.exit(1);
}

function api(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'claude-code'
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = request({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}${path}`,
      method, headers
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(chunks ? JSON.parse(chunks) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode} on ${method} ${path}: ${chunks}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`1) PUT contents/${initFile} 触发仓库初始化...`);
  const initContent = readFileSync(initFile).toString('base64');
  const initResp = await api('PUT', `/contents/${initFile}`, {
    message: 'Day 1-2 initial: bootstrap Next.js 14 (auto-create main branch)',
    content: initContent,
    branch: BRANCH
  });
  console.log(`   ✓ 初始 commit: ${initResp.commit.sha.slice(0, 8)}`);

  const initialSha = initResp.commit.sha;
  console.log('2) 拿初始 commit 的 tree sha 作为 base_tree...');
  const initialCommit = await api('GET', `/git/commits/${initialSha}`);
  const baseTreeSha = initialCommit.tree.sha;
  console.log(`   base tree: ${baseTreeSha.slice(0, 8)}`);

  console.log(`3) 上传剩余 ${otherFiles.length} 个 blobs...`);
  const treeItems = [];
  let i = 0;
  for (const file of otherFiles) {
    i++;
    const content = readFileSync(file).toString('base64');
    const blob = await api('POST', '/git/blobs', { content, encoding: 'base64' });
    process.stdout.write(`\r   [${i}/${otherFiles.length}] ${file.slice(-50)}                    `);
    treeItems.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
  }
  console.log('\n   ✓ 全部 blob 已上传');

  console.log('4) 创建新 tree (基于 base_tree)...');
  const newTree = await api('POST', '/git/trees', { base_tree: baseTreeSha, tree: treeItems });
  console.log(`   tree: ${newTree.sha.slice(0, 8)}`);

  console.log('5) 创建 commit (parent=初始 commit)...');
  const newCommit = await api('POST', '/git/commits', {
    message: 'Day 2: install @supabase/supabase-js + rss-parser, scaffold Next.js project files',
    tree: newTree.sha,
    parents: [initialSha]
  });
  console.log(`   commit: ${newCommit.sha.slice(0, 8)}`);

  console.log('6) 更新 main 分支引用...');
  await api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });
  console.log('   ✓ done');

  console.log(`\n仓库地址: https://github.com/${OWNER}/${REPO}`);
  console.log(`最新 commit: https://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
