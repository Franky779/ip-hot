create table if not exists app_settings (
  key text primary key,
  value integer not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('article_selection_threshold', 6)
on conflict (key) do nothing;

grant select, insert, update on app_settings to ip_hot_app;

alter table app_settings drop constraint if exists app_settings_value_check;
alter table app_settings add constraint app_settings_value_check check (value between 4 and 10);

alter table articles add column if not exists selection_threshold smallint;
update articles set selection_threshold = 6 where selection_threshold is null;
alter table articles drop constraint if exists articles_selection_threshold_check;
alter table articles add constraint articles_selection_threshold_check check (selection_threshold between 4 and 10);
