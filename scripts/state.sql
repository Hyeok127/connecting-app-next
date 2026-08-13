-- 시나리오 모니터링: 현재 상태 한눈에.
select '── 회원 ──' as section;
select name, gender, age, job_type, job_role, region, status,
       (select count(*) from jsonb_array_elements_text(nullif(photos,'')::jsonb)) as photos,
       (email is not null) as has_email, (contact is not null) as has_contact
from users where coalesce(is_admin,0)<>1 order by created_at;

select '── 오늘 순위(rankings) ──' as section;
select u.name as who, t.name as ranks, r.rank, r.cycle_date
from rankings r join users u on u.id=r.user_id join users t on t.id=r.target_id
order by r.cycle_date desc, u.name, r.rank;

select '── 매칭 ──' as section;
select a.name as a, b.name as b, m.state, m.a_response, m.b_response, m.cycle_date,
       (select status from meetings mt where mt.match_id=m.id) as meeting
from matches m join users a on a.id=m.user_a join users b on b.id=m.user_b
order by m.created_at desc;

select '── 사진 교환 동의 ──' as section;
select a.name as a, b.name as b, pc.user_id=m.user_a as a_consented, pc.user_id=m.user_b as b_consented
from photo_consents pc join matches m on m.id=pc.match_id
join users a on a.id=m.user_a join users b on b.id=m.user_b order by pc.created_at;
