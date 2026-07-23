const MAX_REQUESTED_SOURCES = 24

export function parseRequestedSourceIds(requestUrl: string): string[] {
  const ids = new URL(requestUrl).searchParams
    .getAll('sourceId')
    .map((id) => id.trim())
    .filter(Boolean)
  const uniqueIds = [...new Set(ids)]

  if (uniqueIds.length > MAX_REQUESTED_SOURCES) {
    throw new Error(`单次最多可抓取 ${MAX_REQUESTED_SOURCES} 个指定信息源。`)
  }

  return uniqueIds
}

export function selectRequestedSources<T extends { id: string }>(
  sources: T[],
  requestedSourceIds: string[],
): { selectedSources: T[]; missingSourceIds: string[] } {
  const sourcesById = new Map(sources.map((source) => [source.id, source]))
  const selectedSources = requestedSourceIds.flatMap((id) => {
    const source = sourcesById.get(id)
    return source ? [source] : []
  })
  const missingSourceIds = requestedSourceIds.filter((id) => !sourcesById.has(id))

  return { selectedSources, missingSourceIds }
}
