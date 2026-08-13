-- 009_admin_dashboard.sql — 관리자 대시보드 집계를 한 번에 반환하는 함수.
-- p_cycle: 기준 사이클(테스트 override 반영). null이면 실제 KST 오늘.
-- 멱등.

create or replace function admin_dashboard(p_cycle text default null) returns jsonb
language plpgsql stable as $$
declare
  cycle  text := coalesce(p_cycle, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'));
  cutoff text := to_char((cycle::date) - 3, 'YYYY-MM-DD');
  pending_pairs int;
  result jsonb;
begin
  -- 다음 배치가 만들 매칭 수(상호 top3 교집합·미매칭) = "예정"
  with latest as (
    select user_id, max(cycle_date) mc from rankings
    where cycle_date >= cutoff and cycle_date <= cycle group by user_id
  ),
  rk as (select r.user_id, r.target_id, r.rank from rankings r
         join latest l on r.user_id=l.user_id and r.cycle_date=l.mc),
  act as (select id from users where role='member' and status='active'),
  top as (select rk.* from rk join act a on a.id=rk.user_id join act b on b.id=rk.target_id),
  ranked as (select user_id, target_id, rank,
             row_number() over (partition by user_id order by rank) rn from top),
  t3 as (select * from ranked where rn<=3)
  select count(*) into pending_pairs
  from t3 a join t3 b
    on a.user_id < b.user_id and a.target_id=b.user_id and b.target_id=a.user_id
  where not exists (select 1 from matches m
    where (m.user_a=a.user_id and m.user_b=b.user_id) or (m.user_a=b.user_id and m.user_b=a.user_id));

  select jsonb_build_object(
    'cycle', cycle,
    'participants', jsonb_build_object(
      'members',    (select count(*) from users where role='member'),
      'bridges',    (select count(*) from users where role='bridge'),
      'by_status',  coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from users where role='member' group by status) s), '{}'::jsonb),
      'by_gender',  coalesce((select jsonb_object_agg(coalesce(gender,'미상'), c) from (select gender, count(*) c from users where role='member' group by gender) g), '{}'::jsonb),
      'with_photos',(select count(*) from users where role='member' and photos is not null and photos <> '[]'),
      'with_prefs', (select count(*) from preferences),
      'with_email', (select count(*) from users where email is not null)
    ),
    'today', jsonb_build_object(
      'cycle',               cycle,
      'confirmed_rankers',   (select count(distinct user_id) from rankings where cycle_date=cycle),
      'rankable_pool',       (select count(*) from users where role='member' and status='active'),
      'pending_batch_pairs', pending_pairs,
      'matches',             (select count(*) from matches where cycle_date=cycle),
      'matches_by_state',    coalesce((select jsonb_object_agg(state,c) from (select state,count(*) c from matches where cycle_date=cycle group by state) m), '{}'::jsonb)
    ),
    'matching', jsonb_build_object(
      'total_matches',   (select count(*) from matches),
      'by_state',        coalesce((select jsonb_object_agg(state,c) from (select state,count(*) c from matches group by state) m), '{}'::jsonb),
      'active_meetings', (select count(*) from meetings where status='active'),
      'closed_meetings', (select count(*) from meetings where status='closed'),
      'dating_users',    (select count(*) from users where status='dating'),
      'paused_users',    (select count(*) from users where status='paused')
    ),
    -- 퍼널(누적): 순위확정자 → 매칭 → 성사 → 만남 → 교제
    'funnel', jsonb_build_object(
      'rankers',  (select count(distinct user_id) from rankings),
      'matches',  (select count(*) from matches),
      'accepted', (select count(*) from matches where state='accepted'),
      'meetings', (select count(*) from meetings),
      'couples',  (select count(*) from users where status='paused') / 2
    ),
    'bridges', coalesce((
      select jsonb_agg(b) from (
        select u.name,
          (select count(*) from users iv where iv.invited_by=u.id) as invited,
          (select coalesce(sum(pe.points),0) from point_events pe where pe.user_id=u.id) as points
        from users u where u.role='bridge' order by u.created_at
      ) b
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
