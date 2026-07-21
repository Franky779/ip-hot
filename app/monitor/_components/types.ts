export type SourceItem = {
  name: string
  url: string
  id: string
  lastActive?: string
  count7d?: number
}

export type ReviewItem = {
  id: string
  titleCn: string
  summaryCn: string
  commentary: string
  relevanceScore: number
  source: string
  createdAt: string
}

export type CronLog = {
  id: string
  trigger_type: string
  started_at: string | null
  ended_at: string | null
  fetch_total_fetched: number | null
  fetch_total_inserted: number | null
  llm_pending: number | null
  llm_processed: number | null
  llm_failed: number | null
  status: string
  details: { batch_total?: number; [key: string]: unknown } | null
}

export type MonitorData = {
  todayTask: {
    status: string
    triggerType: string
    startedAt: string
    endedAt: string | null
    fetchTotal: number
    inserted: number
    llmPending: number
    llmProcessed: number
    llmFailed: number
    errorMessage: string | null
  } | null
  history: Array<{
    id: string
    startedAt: string
    triggerType: string
    fetchTotal: number
    inserted: number
    llmPending: number
    llmProcessed: number
    llmFailed: number
    status: string
    errorMessage: string | null
    elapsedSeconds: number | null
    details: { batch_total?: number; [key: string]: unknown } | null
  }>
  queue: number
  queueHealth?: {
    level: 'healthy' | 'warning' | 'critical'
    queueWarningThreshold: number
    queueCriticalThreshold: number
    hoursSinceLastRun: number | null
    alerts: Array<{
      level: 'warning' | 'critical'
      message: string
      action: string
    }>
  }
  todayInserted: number
  failedSources: number
  deadSources: number
  activeSources: number
  deadSourceList: SourceItem[]
  failedSourceList: SourceItem[]
  activeSourceList: SourceItem[]
  categoryStats: Array<{ category: string; count: number }>
  recentErrors: Array<{ id: string; startedAt: string; status: string; errorMessage: string | null }>
  sourceQuality?: Array<{ name: string; total: number; low: number; rate: number }>
  reviewQueue?: ReviewItem[]
  reviewStats?: {
    total: number
    lowScore: number      // relevance_score <= 3
    midScore: number      // 4 <= relevance_score <= 6
  }
}

export type LlmProgress = {
  processed: number
  remaining: number
  rounds: number
}

export type AutoProcessorState = {
  enabled: boolean
  remainingMs: number | null
  toggle: () => void
}
