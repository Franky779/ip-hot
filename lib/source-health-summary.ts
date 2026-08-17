import {
  SOURCE_HEALTH_FILTER_OPTIONS,
  type SourceHealthRow,
  type SourceHealthStatus,
} from './source-health.ts'
import { getSourceSchedule } from './source-schedule.ts'

export type HealthCountableSource = {
  id: string
  enabled?: boolean | null
  method?: string | null
  type?: string | null
  name?: string
  url?: string
}

export type HealthCountRow = Pick<SourceHealthRow, 'sourceId' | 'status' | 'filterValue'>

export const SOURCE_HEALTH_CARD_STATUSES = [
  'healthy',
  'repair',
  'dead_links',
  'no_articles',
  'overdue',
  'untested',
] as const

export type SourceHealthCardStatus = (typeof SOURCE_HEALTH_CARD_STATUSES)[number]

export type SourceHealthSummary = {
  total: number
  available: boolean
  byStatus: Record<SourceHealthStatus, number>
  byOptionValue: Record<string, number>
  cards: Record<SourceHealthCardStatus, number>
  running: number
  inactive: number
}

const ALL_STATUSES: SourceHealthStatus[] = [
  'repair',
  'dead_links',
  'no_articles',
  'overdue',
  'untested',
  'running',
  'healthy',
  'inactive',
]

const OPTION_VALUES = new Set(SOURCE_HEALTH_FILTER_OPTIONS.map((option) => option.value))

function deriveFilterValue(
  source: HealthCountableSource,
  status: SourceHealthStatus,
): string | null {
  const executionMode = getSourceSchedule(source).executionMode
  const runState = executionMode === 'cloud' || executionMode === 'local' ? 'active' : 'paused'
  return SOURCE_HEALTH_FILTER_OPTIONS.find((option) =>
    option.status === status && option.runState === runState
  )?.value ?? null
}

export function resolveHealthFilterValue(
  source: HealthCountableSource,
  row: HealthCountRow | undefined,
): string | null {
  const status: SourceHealthStatus = row?.status ?? 'untested'
  if (row?.filterValue && OPTION_VALUES.has(row.filterValue)) {
    return row.filterValue
  }
  return deriveFilterValue(source, status)
}

export function summarizeSourceHealth(
  sources: readonly HealthCountableSource[],
  healthRows: readonly HealthCountRow[] | null,
): SourceHealthSummary {
  const byStatus = Object.fromEntries(
    ALL_STATUSES.map((status) => [status, 0])
  ) as Record<SourceHealthStatus, number>
  const byOptionValue = Object.fromEntries(
    SOURCE_HEALTH_FILTER_OPTIONS.map((option) => [option.value, 0])
  ) as Record<string, number>

  const available = healthRows !== null
  if (available) {
    const rowsBySource = new Map(healthRows.map((row) => [row.sourceId, row]))
    for (const source of sources) {
      const row = rowsBySource.get(source.id)
      const status: SourceHealthStatus = row?.status ?? 'untested'
      byStatus[status] += 1
      const filterValue = resolveHealthFilterValue(source, row)
      if (filterValue) byOptionValue[filterValue] += 1
    }
  }

  const cards = Object.fromEntries(
    SOURCE_HEALTH_CARD_STATUSES.map((status) => [status, byStatus[status]])
  ) as Record<SourceHealthCardStatus, number>

  return {
    total: sources.length,
    available,
    byStatus,
    byOptionValue,
    cards,
    running: byStatus.running,
    inactive: byStatus.inactive,
  }
}
