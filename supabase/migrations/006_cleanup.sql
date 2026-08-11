-- 006_cleanup.sql — 005 이관이 안정화된 뒤 레거시 저장소를 제거한다.
--
-- ⚠ 아직 적용하지 마세요. 005 배포가 운영에서 하루 이상 문제없이 돌아간 것을
--   확인한 뒤 실행합니다. 실행 전 체크:
--     1) 아래 사전검사 쿼리가 모두 0을 반환하는지
--     2) 코드에서 폴백(`life_values ?? workplace`)을 제거하고 배포했는지
--   이 파일은 되돌릴 수 없습니다(컬럼·행 삭제).

-- ── 사전검사: 이관되지 않은 데이터가 남아 있는지 (모두 0이어야 함) ──
-- select
--   (select count(*) from users where workplace is not null
--      and left(btrim(workplace),1)='{'
--      and (life_values is null or life_values <> workplace::jsonb)) as values_미이관,
--   (select count(*) from preferences where workplaces is not null
--      and left(btrim(workplaces),1)='{'
--      and (value_prefs is null or value_prefs <> workplaces::jsonb)) as prefs_미이관,
--   (select count(*) from point_events pe where pe.type='block'
--      and not exists (select 1 from blocks b
--                       where b.user_id=pe.user_id and b.target_id=pe.related_match_id)) as blocks_미이관,
--   (select count(*) from point_events where type like 'email|%'
--      and user_id not in (select id from users where email is not null)) as email_미이관;

-- ── 1) 이관 완료된 point_events 행 제거 (포인트 적립 이벤트는 보존) ──
delete from point_events
 where type = 'block'
    or type = 'photo_consent'
    or type = 'push_sub'
    or type = 'vapid_keys'
    or type like 'report|%'
    or type like 'email|%'
    or type like 'consent|%';

-- ── 2) 재사용하던 컬럼 제거 ──
alter table users       drop column if exists workplace;
alter table preferences drop column if exists workplaces;

-- 참고: 이후 point_events.type은 'match_success' / 'couple_success' 등
--       포인트 이벤트만 갖는다. related_match_id도 본래 의미(매칭 참조)로만 쓰인다.
