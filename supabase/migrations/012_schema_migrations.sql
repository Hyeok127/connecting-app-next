-- 012_schema_migrations.sql — 마이그레이션 적용 상태 추적 (P6-1)
--
-- 문제: 코드 배포(git push → Vercel)와 스키마 변경(수동 Management API)이
--       서로를 모르는 두 파이프라인이었다. 적용 여부가 STATUS.md 산문에만 있어서
--       "머지했으니 반영됐겠지"가 그대로 사고가 된다.
--       실증: 011_fix_autoclose_overflow.sql은 코드에 커밋돼 있어도 DB에 적용하지 않으면
--             30일 만남 자동종료 버그가 그대로 남고, 아무도 그 사실을 알 수 없다.
--
-- 조치: 적용 이력을 DB가 스스로 갖게 하고, /api/health가 미적용 목록을 노출한다.
--       scripts/apply_migration.mjs가 적용 성공 시 여기에 기록한다.

create table if not exists schema_migrations (
  version    text primary key,           -- 파일명에서 확장자를 뺀 값 (예: '011_fix_autoclose_overflow')
  checksum   text not null,              -- 적용 시점 파일의 sha256. 'backfilled'는 소급 입력분
  applied_at timestamptz not null default now(),
  note       text
);

-- 앱은 service_role 단일 경로다(004_hardening과 같은 정책). anon 접근은 막는다.
alter table schema_migrations enable row level security;

-- ── 기존 이력 소급 입력 ──
--
-- ⚠️ 아래 목록은 STATUS.md의 서술("dev/prod 적용 완료")에 근거한 **추정**이다.
--    실제 DB와 다를 수 있으므로, 적용 후 아래 검증 쿼리로 대조할 것.
--    checksum을 'backfilled'로 남겨 "적용 시점에 계산된 값이 아님"을 구분한다.
--
-- 006_cleanup: 의도적 보류 (005 안정화 확인 후 적용) — 넣지 않는다
-- 011_fix_autoclose_overflow: 신규, 미적용 — 넣지 않는다
insert into schema_migrations (version, checksum, note) values
  ('001_init',              'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('002_cron',              'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('003_batch',             'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('004_hardening',         'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('005_normalize',         'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('007_job_split',         'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('008_batch_cycle_param', 'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('009_admin_dashboard',   'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('010_analytics',         'backfilled', 'STATUS.md 기준 소급 입력 (2026-09-02)'),
  ('012_schema_migrations', 'backfilled', '자기 자신 — 이 파일을 적용하는 순간 기록된다')
on conflict (version) do nothing;

-- ── 소급 입력이 맞는지 확인하는 쿼리 (수동 실행) ──
--
-- 004가 실제로 적용됐나 (유니크 인덱스가 있어야 한다):
--   select indexname from pg_indexes where tablename='meetings' and indexdef ilike '%match_id%unique%';
-- 005가 실제로 적용됐나 (컬럼이 있어야 한다):
--   select column_name from information_schema.columns
--    where table_name='users' and column_name in ('life_values','email','consent_version');
-- 007이 실제로 적용됐나:
--   select column_name from information_schema.columns
--    where table_name='preferences' and column_name in ('job_types','job_roles');
-- 006이 아직 미적용인가 (레거시 컬럼이 남아 있어야 한다):
--   select column_name from information_schema.columns
--    where table_name='users' and column_name='workplace';
-- 011이 아직 미적용인가 (아래가 에러 없이 돌면 이미 적용된 것):
--   select auto_close_old_meetings();
--
-- 결과가 위 목록과 다르면 schema_migrations를 직접 고칠 것:
--   delete from schema_migrations where version='00X_...';
--   insert into schema_migrations(version, checksum, note) values ('00X_...', 'backfilled', '수동 정정');
