@AGENTS.md

# 인연 (connecting-app-next)

이름 + PIN 인증으로 돌아가는 소개팅 매칭 서비스. 기존 Express + SQLite 버전을
Next.js(App Router) + Supabase(Postgres)로 이관한 것이 이 저장소다. 기능·화면 구조와
배포 절차는 `README.md`가 정본이고, **이 문서는 "어느 기기에서 뭘 할 수 있고, 뭘 건드리면
운영에 영향이 가는지"만 다룬다.**

## ⚠️ main에 push하면 곧바로 프로덕션이 배포된다

이 저장소는 Vercel GitHub 연동이 걸려 있어 **`main` push = Production 배포**다. PR도
스테이징도 거치지 않는다(2026-08-09 실측 확인: 셸 스크립트 한 줄 고친 커밋 `65eb92e`가
푸시 즉시 Production 배포를 생성했다). 배포 이력은 아래로 확인한다:

```bash
gh api repos/Hyeok127/connecting-app-next/deployments \
  --jq '.[0:5][] | "\(.created_at)  \(.environment)  \(.sha[0:7])"'
```

앱 코드가 아닌 파일(`scripts/`, 문서 등)만 고쳐도 배포는 트리거된다 — 빌드 산출물이
같아서 동작은 안 바뀌지만, "푸시했으니 배포됐다"를 항상 전제할 것. (Apsorb도 데스크탑이
10분마다 pull해 새 코드로 크론을 돌리므로 "push = 운영 반영"인 건 같다. 다른 건 지연시간과
**영향 범위** — 여기는 실사용자가 쓰는 웹서비스라 잘못된 배포가 곧 장애다.) 실사용자가 있는
서비스이므로 `app/`·`lib/`·`components/`를 고칠 땐 push 전에 `npm run build`와
`scripts/smoke_run.sh`를 반드시 통과시킨다.

## 브랜치 전략 — 평소 작업은 `dev`에서 (2026-08-09 도입)

위 문제 때문에 **push와 배포를 분리**했다.

| 브랜치 | 용도 | push하면 |
|---|---|---|
| `dev` | **평소 작업·커밋은 전부 여기** | Vercel **Preview** 배포 (실사용자 무영향) |
| `main` | 릴리스 전용 | Vercel **Production** 배포 |

- 릴리스는 `dev` → `main` 머지로 한다. **`main`에 직접 커밋하지 않는다.**
- GitHub 기본 브랜치는 `main`으로 그대로 뒀다 — 기본 브랜치를 `dev`로 바꾸면 Vercel이
  Production 대상 브랜치를 따라 옮길 수 있어서다(그러면 정반대가 된다).
- 데스크탑 crontab의 `git pull origin main`도 그대로다. 데스크탑 체크아웃은 운영 코드를
  미러링하는 용도라 `main`을 보는 게 맞다. **즉 dev에만 있는 변경은 데스크탑에 안 내려간다.**
- 2026-08-09 실측: `dev` push(`238a01e`) → `Preview` 배포 생성, Production 무변동 확인.

## 기기 배치 (2026-08-09 기준)

기기 이름 체계는 Apsorb의 `CLAUDE.md`와 동일하다(`desktop-rtx2060-wsl`, `laptop-gb5-wsl`,
`laptop-nt9-wsl` — SSH 별칭은 `Desktop_rtx2060_wsl` 식). 세 WSL 기기는 서로 SSH가 뚫려 있다.

| 기기 | 상태 | 비고 |
|---|---|---|
| **nt9** (`laptop_nt9_wsl`) | **개발 주력** | Node 22.22.2, `npm ci` 완료, `.env.local`은 **dev 프로젝트** 지향, 레거시 2종 보유 |
| Desktop (`Desktop_rtx2060_wsl`) | 체크아웃 + Vercel 링크 | Node 22.22.2, `.vercel/` 보유, crontab이 10분마다 `git pull` |
| GB5 (`laptop_GB5_wsl`) | 체크아웃만 | **node 미설치 — 빌드·실행 불가**. 코드 열람용 |

- **로컬 DB도 SSH 터널도 없다.** 데이터는 전부 Supabase 호스팅이다. **어느 프로젝트를
  보는지는 순전히 `.env.local`의 URL이 결정한다** — URL만으로 조용히 붙기 때문에,
  자기가 지금 운영을 보는지 dev를 보는지 파일을 열기 전엔 알 수 없다. 아래
  "dev/prod 데이터 분리" 참고.
- 데스크탑의 `*/10 * * * *` git pull은 코드 최신화용일 뿐, 이 프로젝트를 **실행하는
  크론은 데스크탑에 없다**(Apsorb와 다른 점). 실제 스케줄 실행은 Vercel과 Supabase가 한다.
- `.vercel/`은 gitignore 대상이라 데스크탑에만 있다. nt9는 Vercel에 링크돼 있지 않지만,
  배포가 git push로 이뤄지므로 개발에는 지장이 없다(vercel CLI도 어느 기기에도 없다).

## 스케줄링 — 세 군데에 흩어져 있다

| 시각(KST) | 작업 | 어디서 | 정의 위치 |
|---|---|---|---|
| 매시 정각 | 12시간 응답 만료 + `active` 복귀 | Supabase pg_cron | `supabase/migrations/002_cron.sql` |
| 매일 05:00 | 30일 경과 만남 자동 종료 | Supabase pg_cron | `supabase/migrations/002_cron.sql` |
| 매일 20:00 | 배치 매칭 생성 | Vercel Cron → `/api/cron/batch` | `vercel.json` (`0 11 * * *` UTC) |

스케줄을 바꿀 땐 **어느 쪽 소관인지 먼저 확인할 것.** 마이그레이션 파일을 고쳐도
Supabase에 적용(SQL Editor 실행)하지 않으면 반영되지 않고, `vercel.json`은 push해야 반영된다.

## dev/prod 데이터 분리 (2026-08-10 도입)

Supabase 프로젝트가 두 개다. **둘 다 같은 조직(Hyeok127's Org) 안에 있으니 대시보드에서
반드시 이름·ref를 확인하고 작업할 것.**

| 용도 | 대시보드 이름 | ref (URL 호스트 앞부분) | 리전 |
|---|---|---|---|
| **운영** — 실사용자 데이터 | Connecting | `pcoxykeecgfrdbhynnae` | Seoul |
| **dev** — 개발·실험용 | Hyeok127's Project | `vnwkxkopnpyhabjfclpb` | Singapore |

- dev 프로젝트에는 운영과 동일한 마이그레이션(001~003)이 적용돼 있다(2026-08-10, 테이블
  10개·pg_cron 잡 2개·RPC 함수·photos 버킷 확인 완료). 스키마를 바꿀 땐 **양쪽 모두**
  적용해야 한다 — 마이그레이션 파일 추가 후 dev에서 먼저 실행·검증하고 운영에 적용.
- **nt9의 `.env.local`은 dev 프로젝트를 가리킨다.** 운영값은 같은 파일 안에 `# prod #`
  주석으로 보존돼 있고, 전환은 주석 토글로 한다(원본 백업: `.env.local.prod.bak`).
  운영 데이터를 봐야 할 일이 생기면 토글하되, 끝나면 반드시 dev로 되돌릴 것.
- 데스크탑의 `.env.local`과 Vercel 환경변수는 운영 프로젝트 그대로다.
- 운영/DEV 구분 확인법: `grep "^NEXT_PUBLIC_SUPABASE_URL" .env.local` — `vnwk...`면 dev,
  `pcox...`면 운영.
- **dev 시드 계정**: `dev-root` (bridge·admin, PIN `123456`, 초대코드 `DEVROOT9`) —
  가입에는 기존 유저의 초대코드가 필수(R1)라서 빈 DB에 직접 insert로 심어둔 계정이다.
  dev 전용이며 운영과 무관하다. 새 가입 테스트는 초대코드 `DEVROOT9`로 하면 된다.
- **E2E 검증 이력(2026-08-10, nt9)**: `PORT=3210 npx next dev` 기동 후 실제 dev DB 대상
  가입(200, 토큰 발급) → 잘못된 초대코드 거부(400) → 로그인(200) → `/api/me` 세션
  인증(200)까지 전부 통과. 즉 dev 프로젝트로 개발 서버 + 가입/인증 플로우가 완전 동작한다.

## 개인정보 최소화 설계 (2026-08-11 — 모르는 사람 배포 대비)

참석자 부담을 줄이기 위해 수집 정보를 최소화했다. 되돌리거나 완화하려면 이 목록을 기준으로.

- **닉네임제**: 가입 폼의 "이름"은 닉네임이다(본명 미수집·미노출). 로그인 식별자 겸
  표시명. `users.name` 스키마는 그대로 두고 의미만 바꿈 — 기존 운영 회원의 본명 데이터는
  남아 있으므로 릴리스 시 기존 회원 공지 필요.
- **사진**: 가입 시 받지 않는다. 매칭 **성사 후** 양측이 모두 동의해야 교환된다.
  동의 API는 `POST /api/matches/[id]/photo-consent` — 본인 사진(프로필 등록)이 있어야
  동의 가능. 매칭 목록 API는 양측 동의가 모두 있을 때(`photos_exchanged=true`)만 상대
  photos를 포함한다(이전엔 pending 단계부터 노출 — 구 §3-4 폐기).
  - **동의 저장 방식(DDL 없음)**: 동의는 스키마 변경 없이 기존 `point_events`에
    `type='photo_consent', points=0, related_match_id=매칭, user_id=동의자` 이벤트로
    기록한다. 매칭당 양측 이벤트가 모두 있으면 교환 성립. `points=0`이라 포인트 합산
    (`/me`, `/admin/users`)에 영향 없고, `/me/invitees`의 matched는 accepted 매칭만
    세므로 무관. **처음엔 `matches`에 컬럼 2개를 추가하는 004 마이그레이션으로 설계했으나,
    클라우드 DB에 DDL을 적용하려면 대시보드/DB비번이 필요해 자동 검증이 막혔다 → 기존
    테이블에 DML로 기록하는 방식으로 전환해 마이그레이션을 제거**(004 삭제). 결과적으로
    **이 기능 배포에 DB 작업이 전혀 필요 없다(코드 push만).**
  - **검증(2026-08-11) — 라이브 클라우드 dev DB 통합 STAGE 2 전부 통과**:
    사진 없이 가입(photos 빈 배열) → 매칭 → 성사 후 동의 전 사진 미노출·연락처만 공개 →
    사진 없이 동의 시도 400 거부 → 클라우드 Storage에 사진 등록 후 A만 동의 시 상대 미노출
    → 쌍방 동의 시 상대 photos 응답 포함 + **그 서명 URL로 실제 사진 HTTP 200 도달**.
    즉 "쌍방 동의→실제 사진 전달" 긍정 경로가 라이브 클라우드에서 끝까지 실동작 확인됨.
    (스크립트: scratchpad/cloud_stage2.mjs, dev 서버 3210 경유 실 API 호출)
- **연락처**: 가입 시 받지 않는다. 매칭 수락 시에만 입력받고, 성사된 상대에게만 공개(기존 R11/R12 유지).
- **근무지(workplace)**: 수집 UI 전부 제거(가입·프로필·선호조건). 스키마/서버 필드는 남아
  있어 기존 데이터는 보존됨.
- 직업·사는 곳·MBTI는 "(선택)" 명시 + 대략적 기입 유도 문구.

## 키워드 유사도 + 가치관 설문 (2026-08-11)

- **선호 키워드는 폐지**했다(2026-08-11 오후). 내 프로필 키워드와 상대 프로필 키워드의
  유사도만으로 충분하다고 판단. `preferences.workplaces`는 다시 미사용(`"[]"`).
- **고정 키워드 세트 + 칩 선택(2026-08-11 확장)**: 자유 입력 대신 `lib/keywords.ts`의 고정
  세트(14개 카테고리, ~148개)에서 칩으로 고른다(`components/KeywordPicker.tsx`). 프로필
  키워드·선호 키워드 **각각 최대 5개**(`MAX_KEYWORDS`). 입력은 `cleanKeywords()`로 세트
  안의 값만 통과. 세트를 바꾸면 아래 임베딩을 재생성해야 한다.
- **임베딩 기반 유사도(유의어 연결)**: 각 키워드의 임베딩을 **사전 계산**해
  `lib/keyword_vectors.json`(384차원, 정규화+평균centering된 단위벡터)으로 배포한다.
  생성: `scripts/embed_keywords.mjs`(`@xenova/transformers`, 모델
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2`) — **개발 시 1회 실행, 런타임/배포엔
  모델·API 없음**(정적 JSON만 읽어 코사인 계산). centering은 anisotropy(모든 쌍이 높게
  나오는 현상) 교정용. 코사인 `< 0.4`(SIM_THRESHOLD)는 무관/반대말로 보고 무시.
- **가치관 설문(2026-08-11 오후 추가)**: 술/담배/문신/종교처럼 "다르면 크게 작용하는"
  차원을 선택형으로 응답(`lib/values.ts` `VALUE_DIMENSIONS`, 무응답 허용). 취미 키워드는
  "비슷할수록", 가치관은 "같을수록" 점수가 된다.
  - **저장(DDL 없음)**: 근무지 폐지로 빈 `users.workplace` 컬럼에 JSON으로 기록
    (`{"smoke":"비흡연",...}`). `serialize.publicUser`가 이를 `values`로 파싱해 노출
    (raw workplace 노출은 제거). UI는 `components/ValuesSurvey.tsx`(칩), 표시는
    `components/ui.tsx ValueChips`.
- **추천 알고리즘(`lib/matching.recommendationsFor`)**: 하드 필터(성별/나이/직업/지역/MBTI)
  통과 후보를 점수순 정렬. 점수 = `keywordSimilarity(내 프로필, 상대 프로필)`(양방향
  softCover 합) + `1.0×가치관 일치 개수`(`valueAgreement`). `softCover(A,B)`=A의 각
  키워드가 B에서 갖는 최대 코사인(임계값 0.4 이상)의 합. 동점이면 신뢰점수·가입순.
  키워드/가치관 모두 하드 필터 아님(안 채워도 후보에서 안 빠짐). 세트 밖 레거시는 정확일치만.
- **검증(2026-08-11, 라이브 클라우드)**: ① 임베딩 유의어 — 선호 없이도 프로필 '캠핑'이
  '재테크'보다 상위 정렬(kw_embed_reco.mjs, 구버전 기준이나 로직 동일). ② 가치관 —
  키워드가 동일한 두 후보 중 **가치관(비흡연/무교) 일치 후보가 불일치(흡연/기독교) 후보보다
  상위**, 가치관이 저장·노출됨(values_test.mjs).

## 릴리스 체크리스트 — 개인정보 최소화판 (2026-08-11)

**DB 마이그레이션 불필요** — 사진 교환 동의를 기존 `point_events`에 DML로 기록하도록
설계해, 이 릴리스는 순수 코드 배포다(스키마 변경 없음).

1. **`dev` → `main` 머지 + push** → Vercel Production 자동 배포. (선행 DB 작업 없음)
2. **배포 직후 확인**: 프로덕션 URL 200, 가입 폼에 사진 필드 없음, 기존 계정 로그인 정상.
   (원하면 운영에서도 cloud_stage2 방식으로 매칭→동의→전달 스모크 가능)
3. **기존 회원 공지(수동)**: 기존 회원은 본명으로 가입돼 있다 — 닉네임으로 바꾸려면
   프로필에서 이름을 수정하면 된다는 안내. 기존 등록 사진은 유지되며, 새 매칭부터는
   상호 동의 후에만 공개된다는 것도 함께.

## 환경변수

`.env.local`(gitignore)에 3개가 필요하다. 키 설명은 `.env.example` 참조.

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — **RLS를 우회하는 전권 키.** 서버 코드에서만 쓴다
- `CRON_SECRET` — Vercel Cron 인증용

`VERCEL_OIDC_TOKEN`이 파일에 들어 있을 수 있는데 vercel CLI가 자동 생성하는 단기 토큰이라
기기 간에 옮길 필요가 없다. 새 기기 세팅 시엔 기존 기기에서 `.env.local`을 복사한다
(tailnet scp). 값은 Vercel 프로젝트 환경변수에도 동일하게 들어가 있어야 한다.

## 개발·검증

```bash
npm ci          # package-lock.json 기준 (pnpm/yarn 아님, npm 고정)
npm run dev
npm run lint && npm run build && bash scripts/smoke_run.sh
```

Node는 **22.22.2**로 맞춘다(데스크탑 기준, nt9는 nvm으로 동일 버전 고정). npm이 12로
올리라고 권해도 무시한다 — 기기 간 lockfile 해석 차이를 만들지 않기 위해서다.
`smoke_run.sh`는 더미 Supabase 값으로 서버를 띄워 401/렌더링만 보는 것이라 실데이터를
건드리지 않는다.

## 레거시 — `~/Connecting/connecting-app`, `connecting-app-dev`

이관 전 Express + better-sqlite3 버전(`connecting-app`=운영본, `-dev`=개발본).
**git 미추적**이라 GitHub에 없고, 데스크탑과 nt9에만 파일로 존재한다(2026-08-09 nt9로
복사, `node_modules` 제외). `db/intro.db`와 `uploads/`에 **실제 이용자 계정·사진이 들어
있으므로** 디렉토리 권한을 `700`으로 두고 외부로 옮기지 않는다. 참고용 보관이 목적이고
지금은 실행하지 않는다(돌리려면 각 디렉토리에서 `npm install` 필요).

## 알려진 함정 — 이동 전 경로 하드코딩

프로젝트가 `~/connecting-app-next`에서 `~/Connecting/connecting-app-next`로 옮겨졌는데,
스크립트 일부가 옛 경로를 그대로 갖고 있다.

- `scripts/smoke_run.sh` — 2026-08-09 상대경로로 수정 완료. 이 때문에 README가 안내하는
  검증 절차가 **모든 기기에서 실행 불가**였는데 아무도 눈치채지 못하고 있었다.
- `scripts/migrate_sqlite.mjs` — `OLD_DIR` 기본값이 아직 `/home/jsh/connecting-app`(옛 경로).
  일회성 이관용이고 `OLD_DIR` 환경변수로 덮어쓸 수 있어 방치 중이나, 그냥 실행하면
  경로를 못 찾는다.

새 스크립트를 추가할 땐 절대경로 대신 `cd "$(dirname "$0")/.."` 식으로 쓴다.
