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
