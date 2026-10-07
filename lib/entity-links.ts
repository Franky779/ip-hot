// lib/entity-links.ts — 四库联动的「按名字自动跳转」纯函数（前后端可共用，无 node:fs 依赖）
// 设计目标：案例库里的 IP方/品牌方/工厂 只存了名字（id=0）时，只要对应库里存在同名实体，
// 就自动生成跳转链接，无需管理员手动从下拉框选编号写入 id。正向（案例→四库）与反向（四库→相关案例）共用。

export type EntityKind = 'ip' | 'licensee' | 'factory'

// 实体详情页路由
export function entityDetailHref(kind: EntityKind, id: number): string {
  const base = kind === 'ip' ? 'ipbrand' : kind
  return `/${base}/detail?id=${id}`
}

// 把一组记录（id + 名称变体）收敛成 名称→id 的索引，供按名字反查编号。
function indexFrom(entries: { id: number; names: string[] }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const entry of entries) {
    if (entry.id <= 0) continue
    for (const raw of entry.names) {
      const key = (raw || '').trim()
      if (key && !map.has(key)) map.set(key, entry.id) // 同名时保留第一个，避免覆盖
    }
  }
  return map
}

export function buildLicenseeIndex(records: { id: number; name: string; name_en?: string }[]): Map<string, number> {
  return indexFrom(records.map(r => ({ id: r.id, names: [r.name, r.name_en || ''] })))
}

export function buildFactoryIndex(records: { id: number; name: string; name_en?: string }[]): Map<string, number> {
  return indexFrom(records.map(r => ({ id: r.id, names: [r.name, r.name_en || ''] })))
}

export function buildIpIndex(records: { id: number; name_cn?: string; name_en?: string }[]): Map<string, number> {
  return indexFrom(records.map(r => ({ id: r.id, names: [r.name_cn || '', r.name_en || ''] })))
}

// 把展示名解析成实体编号：先精确匹配；精确不匹配时，若库里有且仅有一条实体名「包含」该展示名
// （如案例写「大悦城」、库里是「上海静安大悦城」），则视为同一家并跳转。多条都包含则判为歧义，不跳（避免错链）。
export function resolveEntityId(index: Map<string, number>, name: string): number | null {
  const key = (name || '').trim()
  if (!key) return null
  const exact = index.get(key)
  if (exact) return exact
  const contained = [...index.keys()].filter(k => k.includes(key))
  if (contained.length === 1) return index.get(contained[0]) as number
  return null
}

// 给定展示名，返回可点击的详情链接；若既无编号也无同名实体则返回 null（调用方按纯文本渲染）。
export function resolveEntityHref(
  kind: EntityKind,
  opts: { id: number; name: string; index: Map<string, number> | null },
): string | null {
  if (opts.id > 0) return entityDetailHref(kind, opts.id)
  if (!opts.index) return null
  const hit = resolveEntityId(opts.index, opts.name)
  return hit ? entityDetailHref(kind, hit) : null
}
