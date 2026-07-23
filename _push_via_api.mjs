// 通过 GitHub API 推送（适用于 github.com:443 不可达但 api.github.com 可达的网络环境）
//
// 用法：
//   node _push_via_api.mjs                              # 上传最近一次本地 commit
//   node _push_via_api.mjs "msg" file1 file2 ...        # 显式指定 commit message 和要推的文件
//
// 必需环境变量：GITHUB_TOKEN
// 仓库：Franky779/ip-hot / 分支 main（如需改，调整下方 OWNER/REPO/BRANCH）

import { existsSync } from 'fs';
import { request } from 'https';
import { execFileSync, execSync } from 'child_process';

const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN not set'); process.exit(1); }

const OWNER = 'Franky779';
const REPO = 'ip-hot';
const BRANCH = 'main';

function gitOut(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const args = process.argv.slice(2);
let commitMessage;
let files;

if (args.length === 0) {
  commitMessage = gitOut('git log -1 --format=%B');
  if (!commitMessage) { console.error('未传参数，且本地无 git commit 可读'); process.exit(1); }
  const lastCommit = gitOut('git diff-tree --no-commit-id --name-only -r HEAD');
  files = lastCommit.split('\n').filter(Boolean);
} else {
  commitMessage = args[0];
  files = args.slice(1);
}

if (files.length === 0) { console.error('没有要推送的文件'); process.exit(1); }

console.log('commit message:');
console.log('  ' + commitMessage.split('\n').join('\n  '));
console.log('files:');
files.forEach(f => console.log('  - ' + f));
console.log();

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
  console.log('1) 获取分支当前 commit...');
  const ref = await api('GET', `/git/ref/heads/${BRANCH}`);
  const parentCommitSha = ref.object.sha;
  console.log('   parent commit:', parentCommitSha);

  const parentCommit = await api('GET', `/git/commits/${parentCommitSha}`);
  const baseTreeSha = parentCommit.tree.sha;
  console.log('   base tree:', baseTreeSha);

  console.log('2) 上传 blobs...');
  const treeItems = [];
  for (const file of files) {
    if (!existsSync(file)) {
      console.log(`   delete ${file}`);
      treeItems.push({ path: file, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const content = execFileSync('git', ['show', `HEAD:${file}`]).toString('base64');
    const blob = await api('POST', '/git/blobs', { content, encoding: 'base64' });
    console.log(`   blob ${file} -> ${blob.sha}`);
    treeItems.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
  }

  console.log('3) 创建新 tree...');
  const newTree = await api('POST', '/git/trees', { base_tree: baseTreeSha, tree: treeItems });
  console.log('   new tree:', newTree.sha);

  console.log('4) 创建新 commit...');
  const newCommit = await api('POST', '/git/commits', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [parentCommitSha]
  });
  console.log('   new commit:', newCommit.sha);

  console.log('5) 更新分支引用...');
  await api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });
  console.log('   ✓ done');

  console.log(`\nhttps://github.com/${OWNER}/${REPO}/commit/${newCommit.sha}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
