begin;

alter table articles
  add column if not exists image_url text;

alter table articles
  add column if not exists is_video boolean not null default false;

commit;
