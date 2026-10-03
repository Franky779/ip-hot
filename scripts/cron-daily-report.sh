#!/bin/bash
# scripts/cron-daily-report.sh — 【已弃用 DEPRECATED，2026-10-04】
#
# 调度已改由 systemd timer 承担（ops/systemd/ip-hot-{daily,weekly,monthly}-report.timer），
# 走 /api/cron/period-report?period=... ，日期在服务端推算，不再依赖 crontab 里的硬编码日期。
# 本脚本仅保留供人工临时补跑历史周期；install-release 会自动清掉 crontab 里的旧条目。
#
# 用法：cron-daily-report.sh <daily|weekly|monthly> [YYYY-MM-DD]

PERIOD="${1:-daily}"
EXPLICIT_DATE="${2:-}"
ENDPOINT="http://127.0.0.1:3101/api/cron/period-report"
LOG="/var/log/ip-hot/cron-daily-report.log"

mkdir -p "$(dirname "$LOG")"

# 显式传日期时用它；否则留空，由服务端推算上一周期
DATE="$EXPLICIT_DATE"

echo "[$(date -Iseconds)] 开始生成 ${PERIOD} ${DATE:-上一周期}" >> "$LOG"
HTTP_CODE=$(curl -s -o /tmp/cron-daily-response.json -w '%{http_code}' -X POST "${ENDPOINT}?period=${PERIOD}${DATE:+&date=${DATE}}")
echo "[$(date -Iseconds)] 完成 HTTP ${HTTP_CODE}" >> "$LOG"
cat /tmp/cron-daily-response.json >> "$LOG" 2>/dev/null
echo "" >> "$LOG"
