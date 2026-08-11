# Connecting — 작업 현황 및 남은 일

> 최종 갱신: 2026-08-12 · 대상 커밋 `08b7287` (main/dev 동일)
> 이 문서는 "무엇이 끝났고, 무엇이 남았고, 무엇이 사람 손을 필요로 하는가"를 정리한다.
> 인프라 구조·기기 역할은 [CLAUDE.md](CLAUDE.md), 배포 절차는 [README.md](README.md)가 정본.

---

## 🔴 지금 바로 해야 할 일 (사람 손 필요)

| # | 할 일 | 이유 | 방법 |
|---|---|---|---|
| 1 | **Supabase 액세스 토큰 교체** | 토큰이 채팅 기록에 노출됨. 이 토큰은 **모든 Supabase 프로젝트를 관리**할 수 있음(DB 삭제 포함) | [토큰 페이지](https://supabase.com/dashboard/account/tokens)에서 기존 토큰 Revoke → 새로 발급 → `.env.local`의 `SUPABASE_ACCESS_TOKEN=` 값만 교체 (채팅에 붙여넣지 말 것) |
| 2 | **개발 서버 상주 설정** | `Linger=no`라 세션이 끝나면 3211 서버가 즉시 죽음. 지금은 접속해도 아무것도 안 뜸 | WSL에서 `sudo loginctl enable-linger jsh && systemctl --user start connecting-preview` |
| 3 | **밤 8시 배치 첫 실행 확인** | 크론이 그동안 한 번도 실행되지 않았음(아래 참고). 수정본이 실제로 도는지 확인 필요 | 20시 이후 `curl -s https://connecting-app-next.vercel.app/api/health` → `matches_today`가 0이 아니면 정상 |

---

## ✅ 완료된 작업

### 1. 기능 개선 11건 (`149b165`)

| # | 기능 | 구현 |
|---|---|---|
| 1 | PIN 변경 | `POST /api/me/pin` + 프로필 "계정 관리" |
| 2 | 신고·차단 | `POST /api/moderation`, `components/ReportBlock.tsx`, 추천·매칭 카드, 관리자 신고 목록, 추천에서 양방향 제외 |
| 3 | 회원 탈퇴 | `DELETE /api/me` (FK 안전 순서) + 2단계 확인 UI |
| 4 | 이메일 알림 | `lib/notify.ts` (Resend) — **휴면 상태**, 아래 "보류" 참고 |
| 5 | 프로필 완성도 | `components/ProfileMeter.tsx` — 미터 + 홈 넛지 배너 |
| 6 | 온보딩 | 첫 방문 시 이용 안내 자동 표시(localStorage) |
| 7 | 키워드 정리 | 검색 + 카테고리 아코디언 (148칩) |
| 8 | 순위 드래그 정렬 | HTML5 DnD (↑↓ 버튼 병행) |
| 9 | 로딩 스켈레톤 | `Skeleton` / `CardSkeleton` / `CardSkeletonGrid` |
| 10 | 새 매칭 강조 | NEW 배지 + 링 펄스 |
| 11 | 신뢰도 노출 | `TrustBadge` (좋음/보통/주의) — 추천·매칭·프로필 |

### 2. 알림 (`533bde8`, `f7523ed`)

- **앱 내 배지**: `GET /api/me/notifications` → 헤더 매칭함 탭에 응답 대기 수(숫자) / 안 본 새 매칭(점). 페이지 이동·창 포커스·응답 시 갱신
- **웹푸시**: `lib/push.ts` + `public/sw.js` + `components/PushToggle.tsx`
  - VAPID 키를 최초 사용 시 자동 생성해 DB 저장 → **환경변수·외부 가입 불필요**
  - 발송 지점: 배치 크론, 수동 배치, 매칭 응답(성사/한쪽 수락)
  - 프로필에 켜기/끄기 + "테스트 알림" 버튼
  - PWA 매니페스트 + 아이콘 (iOS는 홈 화면 추가 후 사용 가능)

### 3. 아이콘 (`9bbc01a`)

'교집합' 컨셉(겹친 두 원 = 상호 3순위 교집합). `scripts/gen_icon.mjs`로 생성, 4배 슈퍼샘플링.

### 4. 운영 점검 대응 (`1eebcc1`)

전면 코드 감사에서 나온 문제를 수정했다. **가장 중요한 발견:**

> **밤 8시 자동 매칭이 한 번도 실행된 적이 없었다.**
> `vercel.json`은 `/api/cron/batch`를 등록했는데 라우트에 `POST`만 있었다.
> Vercel Cron은 **GET**으로 호출 → Next.js가 핸들러 도달 전에 **405** 반환.
> 운영 DB의 `matches` 0행 · `last_match_cycle: null`로 데이터에서도 확인됨.
> 지금까지 매칭은 관리자가 "수동 배치 실행"을 눌렀을 때만 생성됐다.

| 분류 | 수정 |
|---|---|
| 치명 | 크론 `GET` 연결 + 인증을 `Authorization: Bearer`로 정정 (`x-vercel-cron` 헤더는 시크릿이 아니라 `1`이라 기존 분기는 죽은 코드였음) |
| 치명 | 로그인 `ilike`에 `%`/`_` 이스케이프 — `철_` 같은 변형으로 같은 계정을 공격하며 잠금 카운터만 분산시키는 PIN 무차별 대입 우회 차단 |
| 치명 | 정지 계정을 `authFromToken`에서 fail-closed 차단 + 정지/PIN 변경 시 세션 파기. 만남 중(`dating`) 회원도 정지 가능하게 변경 |
| 개인정보 | `/api/me/meeting`이 상호 동의 검사 없이 상대 사진을 노출하던 문제 수정 |
| 개인정보 | 사진 업로드 URL 발급에 인증 필수화(기존엔 비로그인도 발급 가능) |
| 동시성 | 수락 시 매칭 재조회 + 조건부 전이 — 동시 수락 시 성사되지 않던 문제, 연타 시 meeting/포인트 중복 생성 방지 |
| 동시성 | 피드백을 작성자별 1건으로 집계(한 사람이 양쪽 몫 결정·노쇼 중복 감점 방지), 버튼 중복 클릭 방지 |
| 무결성 | 탈퇴 시 상대를 `active`로 복귀 — 상대가 `match_pending`에 영구히 갇히던 문제 |
| 운영 | `GET /api/health` 신설 + 관리자 화면 배치 상태 카드, 신고/차단 속도 제한 |

### 5. 법적 문서 (`1eebcc1`)

- `/terms`, `/privacy` 페이지 (`lib/legal.ts` 단일 출처, `LEGAL_VERSION`으로 개정 관리)
- 가입 시 동의 체크박스(필수) + 동의 이력 기록
- ⚠️ 초안은 변호사 검토를 받지 않았다 (아래 "남은 일" 참고)

### 6. DB 하드닝 — `004_hardening.sql` (dev/prod 적용 완료)

- **RLS 전 테이블 활성화** (정책 없음 = anon 전면 차단). 앱은 service_role 단일 경로라 영향 없음
- 유니크 인덱스: `meetings(match_id)`, `feedbacks(meeting_id, from_user)`, `matches(cycle_date, user_a, user_b)`
- `bump_rate_limit` RPC — 원자적 속도 제한 (기존 read-modify-write는 동시 요청이 전부 통과했음)
- `run_batch_matching_locked` — 자문 잠금으로 배치 중복 실행 방지

### 7. 스키마 정상화 — `005_normalize.sql` (dev/prod 적용 완료, `2e8ac51`)

**Management API로 DDL이 가능하다는 사실을 확인**하면서, 그동안 우회로 쌓인 데이터를 제 이름의 컬럼·테이블로 옮겼다.

| 이전 (우회) | 이후 (정상) |
|---|---|
| `users.workplace` (가치관 JSON) | `users.life_values` (jsonb) |
| `preferences.workplaces` (선호 JSON) | `preferences.value_prefs` (jsonb) |
| `point_events` `'email\|주소'` | `users.email` |
| `point_events` `'consent\|v1'` | `users.consent_version` / `consent_at` |
| `point_events` `'block'` | **`blocks`** (user_id, target_id 유니크) |
| `point_events` `'report\|사유'` | **`reports`** |
| `point_events` `'photo_consent'` | **`photo_consents`** (match_id, user_id) PK |
| `point_events` `'push_sub'` | **`push_subscriptions`** (endpoint 유니크) |
| `point_events` `'vapid_keys'` | **`app_config`** |

- `point_events`는 본래 목적(포인트 적립)만 남음
- FK `on delete cascade` → 탈퇴 시 관련 행 자동 정리. 이관 중 **이미 삭제된 매칭을 가리키는 고아 동의 2건**을 발견(FK가 이런 걸 원천 차단)
- 유니크 제약으로 중복 차단·중복 동의를 DB가 막음 → 앱의 "선조회 후 삽입" 로직 제거
- **백필 결과**: 가치관 dev 202/202, prod 2/2. 배포 후 정합성 불일치 0건
- **검증**: `scripts/smoke_normalize.mjs` — 가입→가치관 수정→이메일→선호→추천→차단/해제→신고→탈퇴 전 경로 통과, 탈퇴 후 고아 행 0건

### 8. 운영 도구 (`77d89ff`)

PostgREST(service_role)로는 DDL이 불가능하지만, **Supabase Management API**(대시보드 SQL Editor와 같은 경로)로 가능하다.

```bash
# .env.local의 SUPABASE_ACCESS_TOKEN 사용
node scripts/sql.mjs "select 1"                              # dev 조회
node scripts/sql.mjs -p "select 1"                           # prod 조회
node scripts/apply_migration.mjs supabase/migrations/00X.sql .env.local.prod.bak
node scripts/inspect_db.mjs .env.local.prod.bak              # RLS·인덱스·함수 확인
```

> 적용 후 PostgREST 스키마 캐시 갱신 필요: `notify pgrst, 'reload schema';`
> 안 하면 새 함수가 "Could not find the function"으로 보인다.

### 9. 개발 서버 상주화

`~/.config/systemd/user/connecting-preview.service` 생성 — 3211 포트, `Restart=always`.
**단, `Linger=no`라 아직 세션 종료 시 죽는다** (위 "지금 바로 해야 할 일" 2번).

---

## 🟡 보류 중인 것 (의도적)

### 이메일 알림
코드는 완성됐지만 **휴면 상태**다. `RESEND_API_KEY`가 없으면 조용히 건너뛴다.
켜려면: [Resend](https://resend.com) 가입 → API 키 발급 → Vercel 환경변수에 `RESEND_API_KEY` (선택: `NOTIFY_FROM_EMAIL`) 추가 → 재배포.
자체 도메인 인증 전에는 본인 가입 이메일로만 발송된다.
프로필의 이메일 입력칸은 "준비 중"으로 안내하며, 입력값은 저장되어 나중에 바로 쓸 수 있다.

### 연령 확인 (만 19세)
**넣지 않기로 결정.** 초대 코드가 있어야만 가입되는 폐쇄형 구조라 초대한 지인이 1차 필터 역할을 한다고 판단.
현재 나이는 사용자가 입력하는 값이며 검증 수단은 없다.

### `006_cleanup.sql` — 미적용
레거시 컬럼(`workplace`, `workplaces`)과 이관 완료된 `point_events` 행을 제거하는 스크립트.
**의도적으로 적용하지 않았다** — 롤백 가능 상태를 유지하기 위해. 읽기는 `life_values ?? workplace` 폴백이라 문제없다.

적용 순서:
1. 005 배포가 운영에서 하루 이상 무사한지 확인
2. `006_cleanup.sql` 상단의 사전검사 쿼리 실행 → 모두 0인지 확인
3. 코드에서 폴백 제거(`lib/matching.ts`, `lib/serialize.ts`) 후 배포
4. `node scripts/apply_migration.mjs supabase/migrations/006_cleanup.sql .env.local.prod.bak`

---

## ❌ 아직 안 한 일

### A. 보안·개인정보 (감사에서 나왔으나 미처리)

| 심각도 | 문제 | 내용 |
|---|---|---|
| 중 | **연락처가 전역 단일 필드** | `users.contact` 하나를 모든 매칭이 공유. 새 매칭에서 연락처를 바꾸면 **예전 상대에게도 새 번호가 보인다**. 매칭별로 스냅샷해야 함 |
| 중 | **차단해도 이미 공개된 정보는 그대로** | 차단은 추천에서만 제외. 이미 공개된 연락처·교환한 사진은 계속 보임. 사진 동의 철회 수단도 없음 |
| 중 | **초대 코드 무제한** | 만료 없음, 인당 상한 없음. 한 사람이 다수 계정을 만들어 추천 풀을 채울 수 있음(초대자 포인트도 누적) |
| 중 | **세션 위생** | TTL 30일 + `localStorage` 저장(XSS로 읽힘). httpOnly 쿠키 미적용 |
| 하 | 탈퇴 보호 없음 | PIN 재확인·속도 제한 없이 토큰만으로 계정 영구 삭제 가능 |
| 하 | 고아 사진 미정리 | 업로드했지만 프로필에 연결되지 않은 객체가 영구히 남음 |
| 하 | `paused` 탈출 수단 없음 | 교제 시작 후 헤어져도 복귀 방법이 없음(관리자 unpause 기능 부재) |

### B. 운영·모니터링

- **에러 모니터링 없음** — Sentry/로그 드레인 미설정. DB 쓰기 실패를 대부분 확인하지 않아(`{ error }` 무시) 절반만 써져도 `200 OK`가 나갈 수 있음
- **`/api/health`에 업타임 모니터 미연결** — 만들어만 뒀고 감시하는 주체가 없음
- **백업 미확인** — Supabase PITR/일일 백업 설정 여부 확인 안 함. 내보내기 스크립트도 없음
- **스케일 한계** — `recommendations`가 활성 회원 전체를 `select *`로 조회(추천 조회 시 + 순위 검증 시 2회). 관리자 화면은 전체 회원+전체 point_events를 무제한 조회. 회원 수백 명까진 무해, 수천 명이면 문제

### C. 인프라

- **Vercel Preview가 어느 DB를 보는지 미확인** — Preview 환경변수가 Production과 같다면 **테스트가 실사용자 데이터를 건드린다**. 확인 필요
- **Preview는 SSO 보호됨** — Vercel 로그인 없이는 302. 폰 확인용으론 로컬 3211이 편함
- **nt9 → 타 노드 SSH 실패** — `Permission denied (publickey)`. 6-way 메시 중 nt9 발신 경로가 끊김
- **Windows 재부팅 시 WSL 자동 기동 없음** — 로그인 후 WSL 터미널을 한 번 열어야 함. 작업 스케줄러로 자동화 가능
- **운영 키가 개발 기기에 존재** — `.env.local.prod.bak`에 prod service_role 키. `.env.local` 주석 토글로 dev/prod를 오가는 방식이라 실수 시 운영 데이터에 직접 접근됨

### D. 법적

- **약관·개인정보처리방침 법률 검토 미완** — 초안 상태. 실제 분쟁 대비하려면 검토 필요
- 개인정보 보호책임자·연락처가 구체적으로 명시되지 않음(서비스 내 신고 기능으로 안내)

---

## 접속 정보

| 용도 | 주소 | 비고 |
|---|---|---|
| 운영 | https://connecting-app-next.vercel.app | main 브랜치 |
| 개발(로컬) | http://100.125.135.35:3211 | tailnet `laptop-nt9-wsl`, dev DB. **linger 설정 후 상시 가능** |
| 개발(Preview) | dev 브랜치 최신 배포 | Vercel SSO 로그인 필요 |

| DB | ref | 회원 수 |
|---|---|---|
| 운영 | `pcoxykeecgfrdbhynnae` | 3명 |
| 개발 | `vnwkxkopnpyhabjfclpb` | 174명 |

---

## 다음에 손대면 좋을 순서 (제안)

1. 위 **"지금 바로 해야 할 일"** 3건
2. Vercel Preview 환경변수 확인 (운영 DB를 보고 있는지)
3. 연락처 매칭별 스냅샷 + 차단 시 정보 숨김 — 실사용자가 늘기 전에 고쳐야 할 개인정보 문제
4. `/api/health`에 업타임 모니터 연결 + Supabase 백업 확인 — 장애를 인지할 수단
5. 006 정리 (005 안정화 확인 후)
6. 초대 코드 상한·만료
