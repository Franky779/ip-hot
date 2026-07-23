begin;

with latest as (
  select id, details
  from cron_logs
  where trigger_type = 'cron_llm'
  order by started_at desc
  limit 1
), affected as (
  select (item ->> 'id')::uuid as id
  from latest,
       lateral jsonb_array_elements(coalesce(details -> 'qualityResults', '[]'::jsonb)) as item
)
update articles
set title_cn = null,
    summary_cn = null,
    category = null,
    relevance_score = null,
    is_selected = false,
    commentary = null
where id in (select id from affected);

with latest as (
  select id
  from cron_logs
  where trigger_type = 'cron_llm'
  order by started_at desc
  limit 1
)
update cron_logs
set status = 'error',
    llm_processed = 0,
    llm_failed = 8,
    llm_pending = 684,
    error_message = 'Migration health check: LLM provider credentials were invalid; article changes were reverted.'
where id in (select id from latest);

commit;

