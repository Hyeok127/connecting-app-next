-- 004_hardening.sql — 운영 점검에서 발견된 구멍 보강 (Supabase SQL Editor에서 1회 실행)
-- 이 파일은 DDL이라 앱(PostgREST)에서 실행할 수 없다. 대시보드에서 붙여넣어 실행할 것.
-- 모두 멱등(여러 번 실행해도 안전)하게 작성했다.

-- ─────────────────────────────────────────────────────────────
-- 1) RLS 활성화 (정책 없음 = anon 전면 차단)
--    앱은 service_role 키로만 접근하고 service_role은 RLS를 우회하므로 동작에 영향 없음.
--    지금은 anon 키가 노출되면 users.pin_hash / sessions 토큰까지 전부 읽힌다.
-- ─────────────────────────────────────────────────────────────
alter table users          enable row level security;
alter table preferences    enable row level security;
alter table rankings       enable row level security;
alter table matches        enable row level security;
alter table meetings       enable row level security;
alter table feedbacks      enable row level security;
alter table point_events   enable row level security;
alter table sessions       enable row level security;
alter table login_attempts enable row level security;
alter table ip_attempts    enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2) 중복 생성 방지용 유니크 인덱스
--    버튼 연타/동시 요청으로 meeting이 2개 생기면 조회가 깨져(만남 화면 공백)
--    두 사람이 30일간 갇힌다. feedback 중복은 한 사람이 양쪽 몫을 결정하게 만든다.
-- ─────────────────────────────────────────────────────────────
create unique index if not exists uniq_meetings_match     on meetings  (match_id);
create unique index if not exists uniq_feedbacks_meeting_user on feedbacks (meeting_id, from_user);
-- 같은 사이클에 같은 쌍이 두 번 매칭되지 않도록(배치 중복 실행 대비)
create unique index if not exists uniq_matches_cycle_pair on matches (cycle_date, user_a, user_b);

-- ─────────────────────────────────────────────────────────────
-- 3) 원자적 속도 제한 (lib/ratelimit.ts가 이 함수를 우선 사용)
--    기존 "조회 후 증가" 방식은 동시 요청이 전부 통과해 PIN 무차별 대입을 막지 못한다.
--    이번 요청을 포함한 카운트를 반환한다.
-- ─────────────────────────────────────────────────────────────
create or replace function bump_rate_limit(
  p_scope text, p_key text, p_now bigint, p_window_ms bigint
) returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  insert into ip_attempts (scope, key, window_start, count)
  values (p_scope, p_key, p_now, 1)
  on conflict (scope, key) do update
    set count        = case when ip_attempts.window_start + p_window_ms < p_now then 1
                            else ip_attempts.count + 1 end,
        window_start = case when ip_attempts.window_start + p_window_ms < p_now then p_now
                            else ip_attempts.window_start end
  returning count into v_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4) 배치 중복 실행 방지 (크론과 수동 배치가 동시에 돌아도 1회만)
--    run_batch_matching 내부의 "이미 실행됨" 검사는 스냅샷 기반이라 동시 실행을 못 막는다.
--    자문 잠금으로 직렬화한다.
-- ─────────────────────────────────────────────────────────────
create or replace function run_batch_matching_locked() returns text
language plpgsql as $$
begin
  -- 트랜잭션 종료 시 자동 해제되는 잠금. 못 잡으면 이미 다른 실행이 진행 중.
  if not pg_try_advisory_xact_lock(hashtext('run_batch_matching')) then
    return 'busy';
  end if;
  return run_batch_matching();
end;
$$;
