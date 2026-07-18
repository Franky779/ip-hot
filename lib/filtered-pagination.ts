type FetchRange<T> = (from: number, to: number) => Promise<T[]>

export async function paginateFilteredResults<T>({
  targetCount,
  batchSize,
  fetchRange,
  include,
}: {
  targetCount: number
  batchSize: number
  fetchRange: FetchRange<T>
  include: (item: T) => boolean
}): Promise<{ items: T[]; hasMore: boolean }> {
  const items: T[] = []
  let offset = 0

  while (items.length <= targetCount) {
    const batch = await fetchRange(offset, offset + batchSize - 1)
    items.push(...batch.filter(include))

    if (batch.length < batchSize) break
    offset += batch.length
  }

  return {
    items: items.slice(0, targetCount),
    hasMore: items.length > targetCount,
  }
}
