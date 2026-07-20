export type SourceExecutionMode = 'cloud' | 'local' | 'manual' | 'paused'
export type SourceScheduleTier = 'daily' | 'every_2_days' | 'weekly'

export type SourceSchedule = {
  executionMode: SourceExecutionMode
  tier: SourceScheduleTier
  slot?: number
  duplicateOf?: string
}

type ScheduleInput = {
  id?: string
  name?: string
  url?: string
  method?: string | null
  type?: string | null
  enabled?: boolean | null
  priority?: string | null
  needsLocalCdp?: boolean
  loginRequired?: boolean
}

const SCHEDULE_HOURS = [4, 9, 14, 23]

function parseMethod(method?: string | null): Record<string, unknown> {
  if (!method) return {}
  try {
    const parsed = JSON.parse(method)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isMode(value: unknown): value is SourceExecutionMode {
  return value === 'cloud' || value === 'local' || value === 'manual' || value === 'paused'
}

function isTier(value: unknown): value is SourceScheduleTier {
  return value === 'daily' || value === 'every_2_days' || value === 'weekly'
}

export function getSourceSchedule(source: ScheduleInput): SourceSchedule {
  const config = parseMethod(source.method)
  const configuredMode = config.execution_mode ?? config.executionMode
  const configuredTier = config.schedule_tier ?? config.scheduleTier
  const needsLocalCdp = source.needsLocalCdp || config.needs_local_cdp === true
  const loginRequired = source.loginRequired || config.login_required === true
  const priority = source.priority ?? (typeof config.priority === 'string' ? config.priority : '')
  const isGovernment = source.type?.toLowerCase() === 'gov'

  const executionMode: SourceExecutionMode = !source.enabled
    ? 'paused'
    : isMode(configuredMode)
      ? configuredMode
      : needsLocalCdp
        ? 'local'
        : loginRequired
          ? 'manual'
          : 'cloud'
  const tier: SourceScheduleTier = isTier(configuredTier)
    ? configuredTier
    : isGovernment || priority === 'P2'
      ? 'weekly'
      : priority === 'P0'
        ? 'daily'
        : 'every_2_days'

  return {
    executionMode,
    tier,
    slot: typeof config.schedule_slot === 'number' && Number.isInteger(config.schedule_slot)
      ? config.schedule_slot
      : undefined,
    duplicateOf: typeof config.duplicate_of === 'string' ? config.duplicate_of : undefined,
  }
}

export function writeSourceSchedule(method: string | null | undefined, schedule: SourceSchedule): string {
  const current = parseMethod(method)
  return JSON.stringify({
    ...current,
    execution_mode: schedule.executionMode,
    schedule_tier: schedule.tier,
    scheduler_version: 1,
    ...(typeof schedule.slot === 'number' ? { schedule_slot: schedule.slot } : {}),
    ...(schedule.duplicateOf ? { duplicate_of: schedule.duplicateOf } : {}),
  })
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getSlotAt(date: Date): number {
  const scheduledHour = SCHEDULE_HOURS.indexOf(date.getUTCHours())
  const slotInDay = scheduledHour >= 0 ? scheduledHour : Math.floor(date.getUTCHours() / 6)
  return Math.floor(date.getTime() / 86_400_000) * SCHEDULE_HOURS.length + slotInDay
}

function tierIntervalSlots(tier: SourceScheduleTier): number {
  if (tier === 'daily') return 4
  if (tier === 'every_2_days') return 8
  return 28
}

export function isCloudSourceDue(source: ScheduleInput, date = new Date()): boolean {
  const schedule = getSourceSchedule(source)
  if (schedule.executionMode !== 'cloud') return false
  const interval = tierIntervalSlots(schedule.tier)
  const identity = source.id || `${source.url || ''}|${source.name || ''}`
  const assignedSlot = typeof schedule.slot === 'number'
    ? schedule.slot % interval
    : stableHash(identity) % interval
  return assignedSlot === getSlotAt(date) % interval
}

export function getNextScheduledAt(source: ScheduleInput, from = new Date()): Date | null {
  const schedule = getSourceSchedule(source)
  if (schedule.executionMode === 'paused' || schedule.executionMode === 'manual') return null
  if (schedule.executionMode === 'local') {
    const next = new Date(from)
    next.setHours(22, 45, 0, 0)
    if (next <= from) next.setDate(next.getDate() + 1)
    return next
  }

  for (let hoursAhead = 1; hoursAhead <= 24 * 8; hoursAhead += 1) {
    const candidate = new Date(from)
    candidate.setMinutes(0, 0, 0)
    candidate.setHours(candidate.getHours() + hoursAhead)
    if (!SCHEDULE_HOURS.includes(candidate.getUTCHours())) continue
    if (isCloudSourceDue(source, candidate)) return candidate
  }
  return null
}

export const EXECUTION_MODE_LABELS: Record<SourceExecutionMode, string> = {
  cloud: '云端抓取',
  local: '本地 CDP',
  manual: '人工处理',
  paused: '已暂停',
}

export const SCHEDULE_TIER_LABELS: Record<SourceScheduleTier, string> = {
  daily: '每天',
  every_2_days: '每两天',
  weekly: '每周',
}
