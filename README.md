# 인연 💝 — connecting-app (Next.js + Supabase 이관판)

기존 Express + SQLite(~/connecting-app) 소개팅 매칭 서비스를 Next.js(App Router) + Supabase(Postgres)로 이관한 프로젝트.

- 인증: 이름 + PIN(비밀번호 해시), 세션 토큰(DB 저장)
- 매칭: 매일 밤 8시(KST) 배치 실행 → 상호 3순위 안에 들면 매칭
- 만남: 양측 교제/종료 선택, 노쇼 신고 시 상대 신뢰점수 -50
- 포인트: 초대 → 가입, 매칭 성사, 커플 성사 시 누적
- 사진: Supabase Storage(private) + Signed URL 직접 업로드/조회

## 구조

```
app/
  page.tsx           로그인/가입 (초대코드 ?code= 파라미터 지원)
  home/              추천 목록 + 내 순위 확정
  matches/           매칭함 + 진행 중 만남/피드백
  profile/           프로필 수정 + 초대코드/초대한 사람
  bridge/            주선자용 (프로필과 동일 화면)
  admin/             관리자 (회원 정지/해제, 수동 배치)
  api/               서버 API (인증·매칭·만남·관리·Cron)
components/          클라이언트 UI
lib/                 인증·배치·상수·업로드·시리얼라이즈
supabase/migrations/ DB 스키마 + pg_cron + 배치 RPC
scripts/             SQLite→Supabase 이관, 스모크 테스트
```

## 로컬 개발

```bash
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
npm run dev
```

## 배포 절차

1. **Supabase 프로젝트 생성** — https://supabase.com 에서 새 프로젝트.
2. **DB 마이그레이션 적용** — Supabase SQL Editor에서 순서대로 실행:
   - `supabase/migrations/001_init.sql` (스키마 + 스토리지 버킷)
   - `supabase/migrations/002_cron.sql` (pg_cron: 시간당 응답만료 + 매일 05:00 KST 만남 자동종료)
   - `supabase/migrations/003_batch.sql` (`run_batch_matching` / `add_trust_score` RPC)
3. **환경변수** (Vercel 프로젝트 설정 또는 로컬 `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL` — Project Settings > API > Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings > API > service_role (서버 전용, 절대 노출 금지)
   - `CRON_SECRET` — `openssl rand -hex 16` 값 (Vercel Cron 인증)
4. **Vercel 배포** — 저장소 연결 후 배포. `vercel.json`이 매일 11:00 UTC(20:00 KST) Cron을 등록.
   - Cron 인증 헤더: Vercel은 `x-vercel-cron` 헤더에 `CRON_SECRET` 값을 담아 호출.
5. **기존 데이터 이관** (선택):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
     OLD_DIR=/home/jsh/connecting-app \
     node scripts/migrate_sqlite.mjs
   ```
   - SQLite의 사용자/순위/매칭/만남/피드백/포인트를 이관하고, `uploads/` 사진을 Storage `photos` 버킷에 업로드.
   - 기존 루트 관리자(`invited_by`가 NULL인 첫 계정, `is_admin=1`)는 유지되어 관리자 페이지 접근 가능.
6. **운영 확인** — 매일 밤 8시(KST) 매칭이 자동 생성되는지 `/admin`의 "수동 배치 실행"으로 먼저 테스트.

## 스케줄링

| 시각 (KST) | 작업 | 구현 |
|---|---|---|
| 매시 정각 | 12시간 응답 만료 + 유저 `active` 복귀 | pg_cron (`002_cron.sql`) |
| 매일 05:00 | 30일 경과 만남 자동 종료 | pg_cron (`002_cron.sql`) |
| 매일 20:00 | 배치 매칭 생성 (`run_batch_matching`) | Vercel Cron (`vercel.json`) |

## 보안 노트

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 코드에서만 사용합니다 (RLS 없이 서버가 직접 접근하는 구조).
- 사진 버킷은 `public=false` — 클라이언트는 `/api/photos/upload-url`로 얻은 Signed URL로만 업로드/조회합니다.
- `/api/cron/batch`는 `CRON_SECRET` + `x-vercel-cron` 헤더를 검증합니다.

## 검증

```bash
npm run lint
npm run build
bash scripts/smoke_run.sh   # 실서버 없이 401/렌더링 동작 확인 (개발용)
```
