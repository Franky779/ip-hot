alter table articles add column if not exists is_manual boolean not null default false;

create index if not exists idx_articles_is_manual on articles (is_manual) where is_manual;
