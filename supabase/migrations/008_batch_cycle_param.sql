-- 008_batch_cycle_param.sql — 배치 매칭에 사이클 날짜를 인자로 넘길 수 있게 한다.
-- 기존엔 함수 내부에서 now()로 계산 → Node의 cycleDate()(테스트 override 포함)와 어긋남.
-- p_cycle을 받으면 그 날짜로 동작하고, null이면 기존과 동일(운영 무영향).
-- 멱등: 여러 번 실행 안전.

-- 0-arg 버전 제거(오버로드 모호성 방지). 새 버전은 p_cycle 기본 null이라 호출 호환.
drop function if exists run_batch_matching();
drop function if exists run_batch_matching_locked();

create or replace function run_batch_matching(p_cycle text default null) returns text
language plpgsql as $$
declare
  cycle text := coalesce(p_cycle, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'));
  cutoff text := to_char((cycle::date) - 3, 'YYYY-MM-DD');
  rec record;
  inserted integer := 0;
begin
  if exists (select 1 from matches where cycle_date = cycle) then
    return 'already:' || cycle;
  end if;

  create temp table pair (
    a text not null, b text not null, score integer not null,
    ca bigint not null, cb bigint not null, primary key (a, b)
  ) on commit drop;
  create temp table used (id text primary key) on commit drop;

  insert into pair
  with latest as (
    select user_id, max(cycle_date) mc
    from rankings where cycle_date >= cutoff and cycle_date <= cycle
    group by user_id
  ),
  rk as (
    select r.user_id, r.target_id, r.rank
    from rankings r
    join latest l on r.user_id = l.user_id and r.cycle_date = l.mc
  ),
  act as (select id from users where role='member' and status='active'),
  top as (
    select rk.user_id, rk.target_id, rk.rank
    from rk
    join act a_ on a_.id = rk.user_id
    join act b_ on b_.id = rk.target_id
  ),
  ranked as (
    select user_id, target_id, rank,
           row_number() over (partition by user_id order by rank) rn
    from top
  ),
  t3 as (select user_id, target_id, rank from ranked where rn <= 3)
  select a.user_id, b.user_id,
         (10 - a.rank) + (10 - b.rank) score,
         ua.created_at ca, ub.created_at cb
  from t3 a
  join t3 b
    on a.user_id < b.user_id
   and a.target_id = b.user_id
   and b.target_id = a.user_id
  join users ua on ua.id = a.user_id
  join users ub on ub.id = b.user_id
  where not exists (
    select 1 from matches m
    where (m.user_a = a.user_id and m.user_b = b.user_id)
       or (m.user_a = b.user_id and m.user_b = a.user_id)
  );

  for rec in
    select * from pair order by score desc, (ca + cb) asc
  loop
    if exists (select 1 from used where id in (rec.a, rec.b)) then
      continue;
    end if;
    insert into matches (id, cycle_date, user_a, user_b, score, state, respond_deadline, created_at)
    values (
      substr(md5(random()::text || clock_timestamp()::text), 1, 16),
      cycle, rec.a, rec.b, rec.score, 'pending',
      (extract(epoch from now()) * 1000)::bigint + 12 * 3600 * 1000,
      (extract(epoch from now()) * 1000)::bigint
    );
    update users set status='match_pending' where id in (rec.a, rec.b);
    insert into used (id) values (rec.a), (rec.b);
    inserted := inserted + 1;
  end loop;

  return 'ok:' || cycle || ':pairs=' || inserted;
end;
$$;

create or replace function run_batch_matching_locked(p_cycle text default null) returns text
language plpgsql as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('run_batch_matching')) then
    return 'busy';
  end if;
  return run_batch_matching(p_cycle);
end;
$$;
