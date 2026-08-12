-- 007_job_split.sql — 직업을 직장유형 + 직무 두 축으로 분리.
-- 기존 단일 job(자유입력→카테고리)은 남겨두고(레거시), 새 두 컬럼을 쓴다.
-- 멱등.

alter table users add column if not exists job_type text;  -- 직장유형(대기업/스타트업 등)
alter table users add column if not exists job_role text;  -- 직무(개발/디자인 등)

alter table preferences add column if not exists job_types jsonb;  -- 바라는 직장유형(배열)
alter table preferences add column if not exists job_roles jsonb;  -- 바라는 직무(배열)
