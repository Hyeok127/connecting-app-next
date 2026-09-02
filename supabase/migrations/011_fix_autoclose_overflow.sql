-- 011_fix_autoclose_overflow.sql
-- 버그: auto_close_old_meetings() 안의 `30 * 86400000`이 int4 곱셈이라
--       2,592,000,000 > int4 상한(2,147,483,647) → "integer out of range"로
--       매일 05:00 KST 크론이 실행될 때마다 실패했다. 즉 30일 만남 자동 종료가
--       한 번도 동작한 적이 없고, 사용자가 status='dating'에 영구히 갇혀
--       배치 매칭 대상(status='active')에서 계속 제외돼 왔다.
-- 조치: 피연산자를 bigint로 승격. 002_cron.sql도 같은 내용으로 수정했으나,
--       이미 적용된 DB에는 반영되지 않으므로 이 마이그레이션으로 함수를 재정의한다.
-- 적용: Supabase SQL Editor에서 실행.

create or replace function auto_close_old_meetings() returns void
language sql as $$
  with old as (
    select mt.id, m.user_a, m.user_b
    from meetings mt
    join matches m on m.id = mt.match_id
    where mt.status='active'
      and mt.started_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000
  ),
  upd_meet as (
    update meetings set status='closed',
      closed_at = (extract(epoch from now()) * 1000)::bigint
    where id in (select id from old)
    returning 1
  )
  update users set status='active'
  where status='dating'
    and id in (select user_a from old union select user_b from old);
$$;

-- 적용 직후 1회 수동 실행 — 그동안 닫히지 못하고 쌓인 만남을 정리한다.
-- (실행 전 아래로 대상 건수를 먼저 확인할 것)
--   select count(*) from meetings
--   where status='active'
--     and started_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
select auto_close_old_meetings();
