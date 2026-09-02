-- 002_cron.sql — 스케줄링: 시간당 응답만료 + 매일 05:00 만남 자동종료 (pg_cron)
-- 주의: Vercel Cron(하루 1회 제한) 대신 pg_cron으로 처리. 스케줄은 UTC 기준.
--   - `0 * * * *`    : 매시간 → 12시간 응답만료 expire (KST 기준 무관)
--   - `0 20 * * *`   : 20:00 UTC = 05:00 KST → 30일 경과 만남 자동종료

create extension if not exists pg_cron;

-- 12시간 응답 기한 만료 + 유저 active 복귀
create or replace function expire_overdue_matches() returns void
language sql as $$
  with exp as (
    update matches set state='expired',
      closed_at = (extract(epoch from now()) * 1000)::bigint
    where state='pending'
      and respond_deadline < (extract(epoch from now()) * 1000)::bigint
    returning user_a, user_b
  )
  update users set status='active'
  where status='match_pending'
    and id in (select user_a from exp union select user_b from exp);
$$;

-- 30일 경과한 active 만남 자동 종료 (점수 변동 없음)
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

select cron.schedule('expire-overdue-hourly', '0 * * * *', 'select expire_overdue_matches();');
select cron.schedule('auto-close-meetings-daily', '0 20 * * *', 'select auto_close_old_meetings();');
