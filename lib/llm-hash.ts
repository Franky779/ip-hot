// lib/llm-hash.ts — 回执输入哈希（零依赖，便于单测）
// 独立成文件的原因：lib/llm-receipts.ts 依赖数据库适配层，
// 而 node --experimental-strip-types 直跑测试时无法解析无扩展名导入。

import { createHash } from 'node:crypto'

/** US 控制字符作分隔符，避免 ['ab','c'] 与 ['a','bc'] 拼出相同字符串 */
const HASH_SEPARATOR = '\u001f'

/** 把影响结果的全部输入拼成稳定哈希：提示词、标题、正文任一变化都会产生新哈希。 */
export function buildInputHash(parts: string[]): string {
  return createHash('sha256').update(parts.join(HASH_SEPARATOR)).digest('hex')
}
