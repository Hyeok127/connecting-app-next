-- 004_photo_exchange.sql — 매칭 후 상호 동의 사진 교환
-- 배경: 가입 시 사진 등록을 없애고(부담 완화), 매칭 성사 후 양측이 모두
-- 동의했을 때만 서로의 사진이 공개되는 방식으로 전환.
-- 적용: dev(vnwkxkopnpyhabjfclpb) 먼저, 릴리스 시 운영(pcoxykeecgfrdbhynnae)에도 실행.

alter table matches add column if not exists a_photo_consent integer not null default 0;
alter table matches add column if not exists b_photo_consent integer not null default 0;
