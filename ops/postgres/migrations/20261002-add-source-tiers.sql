-- A3 信源分级（优化方案 2026-10-02 第一批）
-- 给 info_sources 增加三个字段，全部向后兼容（带默认值），不改动现有数据语义：
--   tier               T1 官方一手 / T1_5 官方账号 / T2 媒体个人（默认）/ EXCLUDE_MP 不参与精选
--   participation_mode editorial 进精选（默认）/ hot_signal 只作热度证据 / isolated 不公开
--   first_party        是否当事方自己发的
-- 幂等：可重复执行；自动初标只修改仍处于默认值（T2 + editorial）的行，人工改过的不动。

alter table info_sources add column if not exists tier text not null default 'T2';
alter table info_sources add column if not exists participation_mode text not null default 'editorial';
alter table info_sources add column if not exists first_party boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'info_sources_tier_check') then
    alter table info_sources add constraint info_sources_tier_check
      check (tier in ('T1', 'T1_5', 'T2', 'EXCLUDE_MP'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'info_sources_participation_mode_check') then
    alter table info_sources add constraint info_sources_participation_mode_check
      check (participation_mode in ('editorial', 'hot_signal', 'isolated'));
  end if;
end $$;

create index if not exists idx_info_sources_tier on info_sources (tier, sort_order);

-- ===== 自动初标（按名称/网址/认证状态的关键词规则，之后在后台人工复核） =====

-- 1) 广告/招商/招聘类 → EXCLUDE_MP（只作热度证据，不出精选）
update info_sources set tier = 'EXCLUDE_MP', participation_mode = 'hot_signal'
 where tier = 'T2' and participation_mode = 'editorial' and not is_official
   and (name ~* '招聘|招商|广告|折扣|优惠券|促销|限时|礼包|代练|外链|友链'
        or url ~* 'promo|coupon|/deals?|affiliate|/jobs?|/careers?');

-- 2) 官方一手 → T1：后台已认证(is_official/verification_status=verified)，
--    或政府/版权/展会官方等强官方特征
update info_sources set tier = 'T1', first_party = true
 where tier = 'T2' and participation_mode = 'editorial'
   and (is_official
        or verification_status = 'verified'
        or url ~* 'gov\.cn|licensinginternational\.org|licensing\.org|\.go\.jp'
        or name ~* '国家版权|版权局|文化和旅游部|市场监管总局|国家新闻出版|广电总局'
        or name ~* '授权展|Licensing Expo|Licensing International|授权业协会');

-- 3) 官方账号 / 准官方 → T1_5：微信公众号等平台号里带"官方"特征或已认证的
update info_sources set tier = 'T1_5'
 where tier = 'T2' and participation_mode = 'editorial'
   and platform in ('wechat', 'weibo', 'x', 'bilibili', 'xiaohongshu', 'douyin')
   and (name ~* '官方|official' or verification_status = 'verified');

-- 其余保持默认 T2（媒体与个人），在后台按需人工调整。
