-- 개발 DB 초기화: 관리자(is_admin=1) 계정만 남기고 테스트 데이터 전부 삭제.
-- FK cascade가 걸린 테이블(blocks/reports/photo_consents/push_subscriptions)은 users 삭제로 함께 정리.
-- 나머지는 명시 삭제.
begin;

-- 비관리자 회원 id 집합
create temp table doomed on commit drop as
  select id from users where coalesce(is_admin,0) <> 1;

delete from feedbacks where meeting_id in (select m.id from meetings m join matches mt on mt.id=m.match_id
  where mt.user_a in (select id from doomed) or mt.user_b in (select id from doomed));
delete from feedbacks where from_user in (select id from doomed);
delete from meetings where match_id in (select id from matches
  where user_a in (select id from doomed) or user_b in (select id from doomed));
delete from matches where user_a in (select id from doomed) or user_b in (select id from doomed);
delete from rankings where user_id in (select id from doomed) or target_id in (select id from doomed);
delete from preferences where user_id in (select id from doomed);
delete from point_events where user_id in (select id from doomed);
delete from sessions where user_id in (select id from doomed);

-- 관리자를 초대자로 참조하던 것 등 정리 후 회원 삭제(cascade 테이블은 자동)
update users set invited_by = null where invited_by in (select id from doomed);
delete from users where id in (select id from doomed);

commit;

-- 결과
select (select count(*) from users) as users, (select count(*) from matches) as matches,
       (select count(*) from rankings) as rankings, (select count(*) from meetings) as meetings,
       (select count(*) from point_events) as events;
