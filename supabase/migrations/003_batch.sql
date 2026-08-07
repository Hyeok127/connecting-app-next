-- 003_batch.sql — 배치 매칭 RPC + 신뢰 점수 RPC
-- 실행: run_batch_matching() 는 R9/R17을 만족하며 원자적으로 매칭 생성.
-- Vercel Cron(매일 11:00 UTC = 20:00 KST) 과 관리자 수동 실행에서 호출.

create or replace function run_batch_matching() returns text
language plpgsql as $$
declare
  cycle text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  cutoff text := to_char((now() at time zone 'Asia/Seoul')::date - 3, 'YYYY-MM-DD');
  rec record;
  inserted integer := 0;
begin
  if exists (select 1 from matches where cycle_date = cycle) then
    return 'already:' || cycle;
  end if;

  create temp table pair (
    a text not null,
    b text not null,
    score integer not null,
    ca bigint not null,
    cb bigint not null,
    primary key (a, b)
  ) on commit drop;
  create temp table used (id text primary key) on commit drop;

  insert into pair
  with latest as (
    select user_id, max(cycle_date) mc
    from rankings where cycle_date >= cutoff
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
      continue; -- R9: 유저당 1사이클 1매칭
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

-- 신뢰 점수 조정 (R20)
create or replace function add_trust_score(uid text, delta integer) returns void
language sql as $$
  update users set trust_score = trust_score + delta where id = uid;
$$;
