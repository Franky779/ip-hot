-- 可选的纯云端方案：在 Supabase SQL Editor 执行一次后，可停用本地 LLMQueueWorker。
-- 执行前将下面的 YOUR_LLM_WORKER_SECRET 替换为 Vercel 的 LLM_WORKER_SECRET。

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'YOUR_LLM_WORKER_SECRET',
  'ip_hot_llm_cron_secret',
  'Authorization secret for the IP Hot LLM worker'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'ip_hot_llm_cron_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'ip-hot-llm-worker';

select cron.schedule(
  'ip-hot-llm-worker',
  '*/3 * * * *',
  $$
  select net.http_get(
    url := 'https://hot.laojia-ip.com/api/cron/process-llm',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ip_hot_llm_cron_secret'
        limit 1
      )
    ),
    timeout_milliseconds := 120000
  );
  $$
);
