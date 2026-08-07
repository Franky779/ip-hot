#!/bin/bash
# scripts/cron-daily-report.sh — 每日/周/月定时触发生成日报HTML
# crontab:
#   0 0 * * * /srv/apps/ip-hot/current/scripts/cron-daily-report.sh daily
#   0 0 * * 1 /srv/apps/ip-hot/current/scripts/cron-daily-report.sh weekly
#   0 0 1 * * /srv/apps/ip-hot/current/scripts/cron-daily-report.sh monthly

PERIOD="${1:-daily}"
ENDPOINT="http://127.0.0.1:3101/api/admin/backfill-daily"
LOG="/var/log/ip-hot/cron-daily-report.log"

mkdir -p "$(dirname "$LOG")"

# 计算上一周期的日期
case "$PERIOD" in
  daily)
    DATE=$(date -d "yesterday" '+%Y-%m-%d' 2>/dev/null || date -v-1d '+%Y-%m-%d')
    ;;
  weekly)
    # 上周一
    DATE=$(date -d "last monday" '+%Y-%m-%d' 2>/dev/null || date -v-mon '+%Y-%m-%d')
    ;;
  monthly)
    # 上月1日
    DATE=$(date -d "last month" '+%Y-%m-01' 2>/dev/null || date -v-1m '+%Y-%m-01')
    ;;
esac

echo "[$(date -Iseconds)] 开始生成 ${PERIOD} ${DATE}" >> "$LOG"
HTTP_CODE=$(curl -s -o /tmp/cron-daily-response.json -w '%{http_code}' -X POST "${ENDPOINT}?date=${DATE}&period=${PERIOD}")
echo "[$(date -Iseconds)] 完成 HTTP ${HTTP_CODE}" >> "$LOG"
cat /tmp/cron-daily-response.json >> "$LOG" 2>/dev/null
echo "" >> "$LOG"
