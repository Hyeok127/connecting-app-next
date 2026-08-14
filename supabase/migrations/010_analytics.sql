-- 010_analytics.sql — 변화 추이 스냅샷 + 매칭 성사요인 수집.
-- 멱등.

-- 시점별 대시보드 스냅샷(추이 그래프용). data = admin_dashboard() 결과.
create table if not exists metrics_snapshots (
  id       text primary key,
  taken_at bigint not null,
  cycle    text not null,
  label    text not null default 'manual',  -- 'auto'(배치 시) | 'manual'(버튼)
  data     jsonb not null
);
create index if not exists idx_metrics_snapshots_taken on metrics_snapshots (taken_at);

-- 매칭 생성 시점의 요인 스냅샷(성사요인 분석용, 2단계).
-- 결과(수락/성사/만남)는 matches/meetings와 조인해서 도출 → 여기엔 '요인'만 저장(불변).
create table if not exists match_features (
  match_id      text primary key references matches(id) on delete cascade,
  cycle_date    text not null,
  keyword_sim   double precision not null default 0,  -- 임베딩 유사도 합
  shared_kw     integer not null default 0,           -- 정확히 겹친 키워드 수
  value_match   integer not null default 0,           -- 가치관 4항목 중 같은 답 수
  age_diff      integer,
  same_region   boolean,   -- 시/도 단위 동일
  same_job_type boolean,
  same_job_role boolean,
  score         integer not null default 0,
  created_at    bigint not null
);
create index if not exists idx_match_features_cycle on match_features (cycle_date);

alter table metrics_snapshots enable row level security;
alter table match_features    enable row level security;
