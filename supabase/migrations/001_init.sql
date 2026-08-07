-- 001_init.sql — Supabase(Postgres) 초기 스키마 (DESIGN.md §8 포팅)
-- 적용: Supabase SQL Editor 에서 실행하거나 `supabase db push` 사용

create table users (
  id          text primary key,
  role        text not null check (role in ('member','bridge')),
  name        text not null,
  pin_hash    text not null,
  gender      text check (gender in ('남성','여성')),
  age         integer,
  job         text,
  workplace   text,
  region      text,
  mbti        text,
  keywords    text not null default '[]',
  photos      text not null default '[]',
  contact     text,
  status      text not null default 'active'
              check (status in ('active','match_pending','dating','paused','suspended')),
  trust_score integer not null default 50,
  invited_by  text references users(id),
  invite_code text not null unique,
  is_admin    integer not null default 0,
  created_at  bigint not null
);

-- member 이름 중복 방지 (대소문자 무시), bridge는 이름 자유
create unique index idx_users_member_name on users (lower(name)) where role='member';
create index idx_users_status on users (status);
create index idx_users_invited_by on users (invited_by);

create table preferences (
  user_id    text primary key references users(id),
  genders    text not null default '[]',
  age_min    integer,
  age_max    integer,
  jobs       text not null default '[]',
  workplaces text not null default '[]',
  regions    text not null default '[]',
  mbtis      text not null default '[]',
  updated_at bigint not null
);

create table rankings (
  user_id    text not null references users(id),
  cycle_date text not null,
  target_id  text not null references users(id),
  rank       integer not null,
  primary key (user_id, cycle_date, target_id)
);
create index idx_rankings_cycle on rankings (cycle_date);
create index idx_rankings_target on rankings (user_id, target_id);

create table matches (
  id               text primary key,
  cycle_date       text not null,
  user_a           text not null references users(id),
  user_b           text not null references users(id),
  score            integer not null,
  state            text not null default 'pending'
                   check (state in ('pending','accepted','rejected','expired')),
  a_response       text not null default 'pending'
                   check (a_response in ('pending','accept','reject')),
  b_response       text not null default 'pending'
                   check (b_response in ('pending','accept','reject')),
  respond_deadline bigint not null,
  created_at       bigint not null,
  closed_at        bigint
);
create index idx_matches_a on matches (user_a, state);
create index idx_matches_b on matches (user_b, state);
create index idx_matches_cycle on matches (cycle_date);

create table meetings (
  id         text primary key,
  match_id   text not null references matches(id),
  status     text not null default 'active' check (status in ('active','closed')),
  started_at bigint not null,
  closed_at  bigint
);
create index idx_meetings_active on meetings (status, started_at);

create table feedbacks (
  id              text primary key,
  meeting_id      text not null references meetings(id),
  from_user       text not null references users(id),
  decision        text check (decision in ('continue','close')),
  reason_category text,
  no_show         integer not null default 0,
  created_at      bigint not null
);
create index idx_feedbacks_meeting on feedbacks (meeting_id);

create table point_events (
  id               text primary key,
  user_id          text not null references users(id),
  type             text not null,
  points           integer not null,
  related_match_id text,
  created_at       bigint not null
);
create index idx_point_events_user on point_events (user_id);

create table sessions (
  token      text primary key,
  user_id    text not null references users(id),
  created_at bigint not null
);
create index idx_sessions_user on sessions (user_id);

-- 로그인 실패 잠금 (서버리스에서 인메모리 불가 → DB 사용)
create table login_attempts (
  name_lower text primary key,
  count      integer not null default 0,
  until      bigint  not null default 0
);

-- IP 단위 속도 제한 (로그인/가입)
create table ip_attempts (
  scope        text not null,
  key          text not null,
  window_start bigint not null,
  count        integer not null default 0,
  primary key (scope, key)
);

-- 사진 저장용 private 스토리지 버킷
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
