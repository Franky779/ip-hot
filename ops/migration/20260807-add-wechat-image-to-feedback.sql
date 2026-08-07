begin;

set local role ip_hot_app;

alter table feedback add column if not exists wechat text;
alter table feedback add column if not exists image text;

commit;
