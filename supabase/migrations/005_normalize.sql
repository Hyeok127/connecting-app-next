-- 005_normalize.sql — DDL 우회로 쌓였던 데이터를 제 이름의 컬럼·테이블로 정리한다.
--
-- 배경: 클라우드에 DDL을 못 넣는다고 판단해 새 데이터를 전부
--   (a) 안 쓰는 컬럼(users.workplace, preferences.workplaces)에 JSON으로,
--   (b) point_events 행에 type 문자열로 인코딩해서(예: 'email|주소', 'report|사유')
--   저장해 왔다. Management API로 DDL이 가능해져 정상 스키마로 되돌린다.
--
-- 전략: 확장(추가) → 이관(백필)만 수행하고 기존 컬럼/행은 남긴다.
--   코드 전환·검증이 끝난 뒤 006에서 정리(삭제)한다. 롤백 가능 상태 유지.
-- 멱등: 여러 번 실행해도 안전.

-- ─────────────────────────────────────────────────────────────
-- 1) 컬럼 추가
--    ※ `values`는 SQL 예약어라 컬럼명으로 쓰지 않고 life_values를 쓴다.
-- ─────────────────────────────────────────────────────────────
alter table users       add column if not exists life_values    jsonb;   -- 가치관(흡연/음주/문신/종교)
alter table users       add column if not exists email          text;    -- 알림 이메일
alter table users       add column if not exists consent_version text;   -- 동의한 약관 버전
alter table users       add column if not exists consent_at     bigint;  -- 동의 시각
alter table preferences add column if not exists value_prefs    jsonb;   -- 상대에게 바라는 가치관

-- ─────────────────────────────────────────────────────────────
-- 2) 테이블 추가 (사용자 삭제 시 함께 지워지도록 cascade)
-- ─────────────────────────────────────────────────────────────
create table if not exists blocks (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,  -- 차단한 사람
  target_id  text not null references users(id) on delete cascade,  -- 차단당한 사람
  created_at bigint not null,
  unique (user_id, target_id)
);
create index if not exists idx_blocks_user   on blocks (user_id);
create index if not exists idx_blocks_target on blocks (target_id);

create table if not exists reports (
  id          text primary key,
  reporter_id text not null references users(id) on delete cascade,
  target_id   text not null references users(id) on delete cascade,
  reason      text not null,
  created_at  bigint not null
);
create index if not exists idx_reports_target on reports (target_id);

create table if not exists photo_consents (
  match_id   text not null references matches(id) on delete cascade,
  user_id    text not null references users(id)   on delete cascade,
  created_at bigint not null,
  primary key (match_id, user_id)
);

create table if not exists push_subscriptions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at bigint not null
);
create index if not exists idx_push_subs_user on push_subscriptions (user_id);

-- 앱 전역 설정(웹푸시 VAPID 키쌍 등). 사용자에 매달려 있을 이유가 없던 값.
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at bigint not null
);

alter table blocks             enable row level security;
alter table reports            enable row level security;
alter table photo_consents     enable row level security;
alter table push_subscriptions enable row level security;
alter table app_config         enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3) 백필 — 기존 데이터를 새 위치로 복사 (원본은 그대로 둔다)
-- ─────────────────────────────────────────────────────────────

-- 가치관: users.workplace에 JSON 객체로 저장돼 있던 것 (자유텍스트 잔재는 건너뜀)
update users
   set life_values = workplace::jsonb
 where life_values is null
   and workplace is not null
   and left(btrim(workplace), 1) = '{';

-- 바라는 가치관: preferences.workplaces (레거시 배열은 제외, 객체만)
update preferences
   set value_prefs = workplaces::jsonb
 where value_prefs is null
   and workplaces is not null
   and left(btrim(workplaces), 1) = '{';

-- 알림 이메일: type='email|<주소>' (사용자당 최신 1건)
update users u
   set email = e.addr
  from (
    select distinct on (user_id) user_id, substring(type from 7) as addr
      from point_events
     where type like 'email|%'
     order by user_id, created_at desc
  ) e
 where u.id = e.user_id and u.email is null;

-- 약관 동의: type='consent|<버전>'
update users u
   set consent_version = c.ver, consent_at = c.at
  from (
    select distinct on (user_id) user_id, substring(type from 9) as ver, created_at as at
      from point_events
     where type like 'consent|%'
     order by user_id, created_at desc
  ) c
 where u.id = c.user_id and u.consent_version is null;

-- 차단
insert into blocks (id, user_id, target_id, created_at)
select distinct on (pe.user_id, pe.related_match_id)
       pe.id, pe.user_id, pe.related_match_id, pe.created_at
  from point_events pe
  join users a on a.id = pe.user_id
  join users b on b.id = pe.related_match_id
 where pe.type = 'block' and pe.related_match_id is not null
 order by pe.user_id, pe.related_match_id, pe.created_at
on conflict (user_id, target_id) do nothing;

-- 신고
insert into reports (id, reporter_id, target_id, reason, created_at)
select pe.id, pe.user_id, pe.related_match_id,
       coalesce(nullif(split_part(pe.type, '|', 2), ''), '기타'), pe.created_at
  from point_events pe
  join users a on a.id = pe.user_id
  join users b on b.id = pe.related_match_id
 where pe.type like 'report|%' and pe.related_match_id is not null
on conflict (id) do nothing;

-- 사진 교환 동의
insert into photo_consents (match_id, user_id, created_at)
select distinct on (pe.related_match_id, pe.user_id)
       pe.related_match_id, pe.user_id, pe.created_at
  from point_events pe
  join matches m on m.id = pe.related_match_id
  join users  u on u.id = pe.user_id
 where pe.type = 'photo_consent' and pe.related_match_id is not null
 order by pe.related_match_id, pe.user_id, pe.created_at
on conflict (match_id, user_id) do nothing;

-- 웹푸시 구독: related_match_id에 PushSubscription JSON이 통째로 들어 있었다
insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
select pe.id, pe.user_id,
       pe.related_match_id::jsonb ->> 'endpoint',
       pe.related_match_id::jsonb -> 'keys' ->> 'p256dh',
       pe.related_match_id::jsonb -> 'keys' ->> 'auth',
       pe.created_at
  from point_events pe
  join users u on u.id = pe.user_id
 where pe.type = 'push_sub'
   and pe.related_match_id is not null
   and left(btrim(pe.related_match_id), 1) = '{'
   and pe.related_match_id::jsonb ->> 'endpoint' is not null
on conflict (endpoint) do nothing;

-- VAPID 키쌍 → app_config (가장 먼저 만들어진 1건이 정본)
insert into app_config (key, value, updated_at)
select 'vapid_keys', pe.related_match_id::jsonb, pe.created_at
  from point_events pe
 where pe.type = 'vapid_keys'
   and pe.related_match_id is not null
   and left(btrim(pe.related_match_id), 1) = '{'
 order by pe.created_at
 limit 1
on conflict (key) do nothing;
