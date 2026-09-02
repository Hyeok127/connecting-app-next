# 설문 v2 — `dev` 기준 델타 설계

작성 2026-09-02. 기준 커밋: `origin/dev` (`e177b74`). 상태: **설계안(미구현)**.

> ⚠️ **이 문서는 `dev` 기준이다.** 최초 초안은 `main`을 보고 썼는데, 그건 뒤처진 프로덕션 스냅샷이었다.
> ("44커밋 뒤"라고 적었던 것은 **로컬 `main` 참조가 낡아서** 생긴 오류 — 실제 격차는 그보다 훨씬 작았다.) 그 초안이 "새로 만들자"고 제안한 것 중 상당수(직군 2축·지역 드릴다운·
> 키워드 고정 칩·가치관 설문·나의 것/바라는 것 분리)는 **`dev`에 이미 구현돼 있다.**
> 아래는 그것을 걷어낸 **진짜 남은 격차**만 다룬다.

---

## 0. 현황 — `dev`에 이미 있는 것

| 축 | 구현 | 위치 |
|---|---|---|
| 직군 | **직장유형 11종 + 직무 16종 2축 선택식** | `lib/profileOptions.ts` `JOB_TYPES`/`JOB_ROLES`, `users.job_type`/`job_role`, `preferences.job_types`/`job_roles` (007) |
| 지역 | **시/도 → 구/시 드릴다운 + 계층 매칭** | `REGIONS`, `regionCovers()` — "서울"은 "서울 강남구"를 커버 |
| 관심사 | **고정 키워드 148칩 + 임베딩 유의어 유사도** | `lib/keywords.ts`, `components/KeywordPicker.tsx` (`3536e51`) |
| 가치관 | **4축(흡연·음주·문신·종교), 선택지에 기준 명시** | `lib/values.ts` `VALUE_DIMENSIONS`, `users.life_values` jsonb (005) |
| 나 vs 이상형 분리 | **`life_values`(나) / `value_prefs`(상대에게 바라는 것)** | `preferences.value_prefs` jsonb, `valuePreferenceScore()` (`01eb2af`) |
| 선호 로딩 | `GET /api/me/preferences` 존재 — 저장 시 초기화 버그 해결됨 | `721c9af` |
| 추천 성능 | N+1 제거, 100명 기준 ~32s → ~0.5s | `293d787` |
| 추천 사유 | 궁합 강도 바 + 겹친 키워드 강조 + 일치 가치관 배지 | `fcc172f` |

**즉 "자유텍스트 → 객관식" 전환은 이미 대부분 끝났다.** 남은 문제는 다른 층에 있다.

---

## 1. 진짜 남은 격차 — 우선순위 순

### 🔴 G1. 중요도 가중치가 없다 — 모든 선호가 동등하다

`value_prefs`는 **허용 값의 배열**일 뿐이고, `valuePreferenceScore()`는 충족 **항목 수를 셀 뿐**이다.

```ts
// lib/values.ts
export function valuePreferenceScore(myPrefs, theirVals): number {
  let n = 0;
  for (const d of VALUE_DIMENSIONS) {
    if (acc?.length && tv && acc.includes(tv)) n++;   // ← 전부 1점. 가중치 없음
  }
  return n;
}
```

**결과**: "종교는 반드시 무교여야 한다"는 사람과 "문신은 없는 편이 좋다" 정도인 사람이
**똑같이 1점**을 받는다. 이상형에서 무엇이 중요하고 무엇이 사소한지가 데이터에 존재하지 않는다.

**조치** — `value_prefs`의 값 형태를 배열에서 객체로 승격한다.

```jsonc
// 현재
{ "smoke": ["비흡연"], "religion": ["무교", "불교"] }

// 제안
{
  "smoke":    { "accepted": ["비흡연"],         "importance": 3 },  // 절대조건
  "religion": { "accepted": ["무교", "불교"],   "importance": 1 }   // 있으면 좋음
}
```

`importance`: `0 상관없음 · 1 있으면 좋음 · 2 중요 · 3 절대조건`.
`parseValuePrefs()`가 **구형(배열) 값을 `{accepted, importance: 1}`로 승격**하도록 하면 마이그레이션 없이 호환된다.

### 🔴 G2. 딜브레이커(절대조건)가 없다 — 전부 가산점이다

현재 가치관은 **soft 가산점**뿐이라 "흡연자는 절대 안 된다"를 표현할 방법이 없다.
반대로 `job_types`/`job_roles`/`regions`는 **hard AND 필터**라 극단이 공존한다.

**조치** — `importance = 3`인 항목만 하드 필터로 승격하고, 나머지는 전부 점수로 내린다.
**UI·DB 양쪽에서 절대조건은 최대 3개로 제한한다.** 무제한이면 후보풀이 수학적으로 0이 된다.

```sql
create or replace function check_dealbreaker_limit() returns trigger
language plpgsql as $$
declare n int;
begin
  select count(*) into n
  from jsonb_each(new.value_prefs)
  where (value->>'importance')::int = 3;
  if n > 3 then
    raise exception '절대조건은 최대 3개까지 지정할 수 있습니다 (현재 %개)', n;
  end if;
  return new;
end; $$;

create trigger trg_dealbreaker_limit
  before insert or update of value_prefs on preferences
  for each row execute function check_dealbreaker_limit();
```

### 🔴 G3. 관계 지향(`intent`)이 없다 — 멀티모드가 불가능하다

"무엇을 위한 만남인가"를 담는 필드가 하나도 없다.
그런데 `CLOSE_REASONS`의 1순위는 **"가치관 차이"**다 — 종료 사유 1위를 만드는 축을 안 묻고 있다.

| key | 질문 | 선택지 |
|---|---|---|
| `intent` | 어떤 만남을 찾고 있나요? | ① 진지한 만남 (결혼을 염두에 둠) / ② 좋은 사람이면 자연스럽게 / ③ 가볍게 알아가기·친구부터 |

**필터 규칙**: ①↔③ 매칭 금지. ②는 ①·③ 모두와 가능.
세 모드를 한 서비스에서 굴리되 **목적이 정면충돌하는 조합만** 잘라내는 최소 규칙이다.

`intent`가 ①·②일 때만 아래를 조건부로 추가 노출한다:

| key | 질문 | 선택지 |
|---|---|---|
| `marriage_timing` | 결혼 계획 | 1~2년 내 / 3년 내 / 생각은 있으나 시기 미정 / 아직 없음 / 비혼 |
| `children` | 자녀 계획 | 원함 / 원치 않음 / 상대와 상의해서 |
| `finance_style` | 돈에 대한 태도 | 계획적으로 모으는 편 / 쓸 땐 쓰는 편 / 균형 / 아직 정리 안 됨 |

### 🟠 G4. 성격 축이 MBTI 자유텍스트 하나뿐이다

`users.mbti`는 검증 없는 4글자 자유입력이고("ABCD"도 통과), 성격을 나타내는 다른 축이 없다.
16칸 완전일치를 상호 조건으로 곱하면 초대제 폐쇄망의 작은 모수에서 후보풀이 실질 0이 된다.

**조치** — MBTI는 **표시 전용으로 강등**(필터에서 제거)하고, 5축 5점 척도를 도입한다.

| key | 1 ←→ 5 |
|---|---|
| `p_energy` | 사람 많은 자리에서 힘을 얻는다 ←→ 혼자 있을 때 회복한다 |
| `p_plan` | 미리 계획하는 편 ←→ 그때그때 즉흥적인 편 |
| `p_express` | 감정 표현이 풍부한 편 ←→ 담백하고 일정한 편 |
| `p_conflict` | 갈등은 바로 대화로 푼다 ←→ 시간을 두고 정리한 뒤 말한다 |
| `p_outdoor` | 주말엔 밖에서 활동 ←→ 주말엔 집에서 충전 |

각 축은 「나」 1개 + 「상대 선호 방향」(비슷했으면 / 보완됐으면 / 상관없음) + 중요도.

### 🟠 G5. 연락·데이트 스타일이 없다 — 초기 이탈의 최대 원인

| key | 질문 | 선택지 |
|---|---|---|
| `contact_freq` | 선호하는 연락 빈도 | 하루 종일 톡 / 틈틈이 / 하루 1~2번 / 필요할 때만 |
| `meet_freq` | 선호하는 만남 빈도 | 주 3회 이상 / 주 1~2회 / 2주 1회 / 월 1회 |
| `first_date` | 첫 만남으로 좋은 것 | 카페 / 식사 / 술 한잔 / 액티비티 / 산책·드라이브 |
| `date_cost` | 데이트 비용 | 각자 / 번갈아 / 상황에 맞게 / 한쪽이 조금 더 |

가치관 4축(흡연·음주·문신·종교)은 **거르는 축**이지 **맞춰보는 축**이 아니다.
실제로 3개월차에 관계를 깨는 건 연락 빈도와 만남 리듬의 불일치다.

### 🟡 G6. 나이가 정수 스냅샷이다

```ts
// lib/types.ts
age: number | null;
```

29세로 가입한 사람은 영원히 29세다. 나이 필터가 시간이 갈수록 조용히 틀려진다.

**조치** — `users.birth_year smallint` 추가, `age`는 계산값으로 전환.
기존 `age`는 남겨두고 `birth_year = 가입연도 - age`로 역산 채운 뒤(오차 ±1년) 사용자에게 1회 확인 요청.

### 🟡 G7. 자기소개 서술 필드가 없다

`2d59134`에서 **닉네임제·가입 사진 제거**로 개인정보를 최소화하면서, 추천 카드에 남은 정보가 더 줄었다.
사진도 매칭 후 상호동의 전엔 안 보인다. 그런데 `users`에 **자기소개 컬럼이 하나도 없다**.

**조치** — `users.intro text` 추가(100~500자, 매칭 미사용·표시 전용). 추천 카드에 2줄 노출.
개인정보 최소화 기조와 충돌하지 않는다 — 식별정보가 아니라 **맥락**이기 때문이다.

### 🟡 G8. 가중치를 뽑는 트레이드오프 문항이 없다

선호를 직접 물으면 전원이 "다 중요하다"고 답한다. 강제선택으로 진짜 우선순위를 뽑아야 한다.

**7-1. 강제선택 (A vs B)**

| key | A | B | 뽑는 축 |
|---|---|---|---|
| `t_talk_hobby` | 대화는 잘 통하지만 취미가 다른 사람 | 취미는 같지만 대화 스타일이 다른 사람 | 성격 vs 관심사 |
| `t_contact_focus` | 자주 못 만나도 연락이 자상한 사람 | 연락은 뜸해도 만나면 집중하는 사람 | 연락 빈도 |
| `t_stable_passion` | 안정적인 직업을 가진 사람 | 하고 싶은 일을 하는 사람 | 직군 |
| `t_similar_complement` | 나와 비슷한 성격 | 나를 보완하는 성격 | **성격 fit 부호 결정** |
| `t_plan_spontaneous` | 계획적인 데이트 | 즉흥적인 데이트 | 계획성 |
| `t_social_couple` | 친구·가족과 잘 어울리는 사람 | 둘만의 시간을 더 중시하는 사람 | 사회성 |
| `t_near_far` | 가까이 살지만 조건이 아쉬운 사람 | 멀지만 잘 맞는 사람 | **지역 가중치** |

`t_similar_complement`가 핵심이다 — 성격 5축의 `fit`을 **유사도로 볼지 상보성으로 볼지**를 이 한 문항이 결정한다.

**7-2. 우선순위 TOP 3**

> "상대를 고를 때 가장 중요한 것 3개를 순서대로 골라주세요."
> 외모 · 성격 · 가치관 · 경제력 · 직업 · 유머코드 · 취미 공유 · 생활습관 · 가정환경 · 학력

1위 ×3, 2위 ×2, 3위 ×1을 §2 점수식의 `w(q)`에 곱한다.

---

## 2. 매칭 점수 재설계

설문만 늘리고 `lib/matching.ts`를 그대로 두면 아무것도 달라지지 않는다.

### 1층 · 하드 필터

```
intent 충돌(①↔③)  ∨  성별 불일치  ∨  나이 범위 밖
∨  importance=3 (절대조건) 위반 — 양방향
∨  기존 매칭 이력  ∨  차단(moderation)
```

**직군·지역·MBTI를 절대 AND로 거는 현재 방식을 폐기하고 2층(점수)으로 내린다.**
현재는 `job_types`·`job_roles`·`regions`가 전부 하드 필터라, 셋을 조금씩만 좁혀도 곱해져서 후보가 0이 된다.

### 2층 · 가중 유사도 (0~100)

```
score(me,you) = Σ_q w(q)·fit(q) / Σ_q w(q) × 100

w(q)   = importance(q) × (TOP3 순위 계수)
fit(q) = 단일선택 : 상대 값이 accepted에 포함되면 1
         척도5    : 1 − |원하는 값 − 상대 값| / 4    (보완 선호면 부호 반전)
         키워드   : IDF 가중 Jaccard (현행 임베딩 유사도를 IDF로 보정)
         지역     : 같은 구 1.0 / 같은 시도 0.6 / 인접 시도 0.3 / 그 외 0.1
```

키워드는 이미 임베딩 유사도를 쓰고 있으나, **"여행"처럼 절반이 고르는 태그**와 "클라이밍"이
같은 가중치를 갖는다. IDF 보정으로 희소 태그의 신호 가치를 올린다.

### 3층 · 상호성 보정

```
final = 2·score(me,you)·score(you,me) / (score(me,you) + score(you,me))
```

**조화평균**을 쓰는 이유: 한쪽만 100점이고 반대쪽이 20점인 짝을 산술평균(60)으로 올려보내면
수락률이 낮은 매칭이 양산된다. 조화평균은 33점으로 눌러 **쌍방 적합**을 우선한다.

### tie-break

동점에서 `created_at desc`로 떨어지면 오래된 회원이 영구 비노출된다.
`hash(user_id ‖ cycle_date)` 기반 **결정론적 셔플**로 바꾼다 — 같은 날엔 안정적, 날짜가 바뀌면 순환.

---

## 3. 스키마 델타

```sql
-- 012_survey_v2.sql (제안)

-- G3 관계 지향
alter table users add column if not exists intent text
  check (intent in ('serious','natural','casual'));
alter table users add column if not exists marriage_timing text;
alter table users add column if not exists children text;
alter table users add column if not exists finance_style text;

-- G4 성격 5축 · G5 연락/데이트 스타일 — life_values와 같은 jsonb 패턴을 재사용
alter table users add column if not exists traits      jsonb;  -- {p_energy:3, p_plan:5, ...}
alter table users add column if not exists date_style  jsonb;  -- {contact_freq:"틈틈이", ...}
alter table preferences add column if not exists trait_prefs      jsonb;
alter table preferences add column if not exists date_style_prefs jsonb;

-- G8 트레이드오프 · 우선순위
alter table users add column if not exists tradeoffs   jsonb;  -- {t_talk_hobby:"A", ...}
alter table users add column if not exists priorities  jsonb;  -- ["성격","가치관","취미공유"]

-- G6 나이 · G7 자기소개
alter table users add column if not exists birth_year smallint
  check (birth_year between 1930 and extract(year from now())::int - 18);
alter table users add column if not exists intro text
  check (intro is null or char_length(intro) between 100 and 500);
```

`life_values`/`value_prefs`가 이미 jsonb + `clean*()` 검증 함수 패턴을 확립해 놨으므로,
**신규 축도 같은 패턴을 그대로 따른다** — 컬럼 하나 + `lib/*.ts`의 옵션 정의 + `clean/parse` 쌍.
새 문항마다 DDL을 치는 게 부담이면 `profile_answers(user_id, question_key, value jsonb)` 세로형으로
한 번에 전환하는 선택지도 있으나, 현행 패턴과의 일관성을 깨므로 **권고하지 않는다.**

---

## 4. 이행 계획

| 단계 | 내용 | 위험 |
|---|---|---|
| **0** | 살아있는 확정 버그 3건 선수정 (→ `docs/AUDIT_2026-09-02.md`) | 낮음 · **완료** |
| **1** | G1 중요도 + G2 딜브레이커 — `value_prefs` 객체 승격 + 하위호환 파서 + 3개 제한 트리거 | 낮음 |
| **2** | G3 `intent` 추가 + 하드 필터 규칙 1줄. **가장 효과 대비 비용이 좋다** | 낮음 |
| **3** | G6 `birth_year` · G7 `intro` — 스키마 추가 후 기존 회원에게 1회 입력 요청 | 낮음 |
| **4** | G4 성격 5축 + G5 연락·데이트 스타일 + G8 트레이드오프 | 중 |
| **5** | 직군·지역을 하드 필터에서 점수로 강등 + 3층 점수식 교체 | **높음** |
| **6** | MBTI 필터 제거 (표시는 유지) | 중 |

> **5단계는 반드시 shadow 실행한다.** 기존 산식과 새 산식을 병행 계산해 추천 결과 차이를 로깅하고,
> 며칠 관찰한 뒤 전환한다. `main` push가 곧 프로덕션이라 롤백 창이 없다.
> 이미 `scripts/scenario.mjs`(다중일 시나리오 시뮬레이션)가 있으니 여기에 붙이면 된다.

---

## 5. 미결 — 사용자 결정 필요

1. **`intent` 3분류가 맞나** — 초대제 지인 기반이면 애초에 ③(가벼운 만남)이 거의 없을 수 있다. 그렇다면 2분류로 줄이고 문항을 아낀다.
2. **`intro` 필수 여부** — 닉네임제·사진 비공개 기조에서 카드에 남는 정보가 거의 없다. 권고: **필수, 100자 하한**.
3. **문항 총량** — G3~G5·G8을 다 넣으면 온보딩이 20문항을 넘는다. 가입 필수는 `intent`까지만 두고 나머지는 "추천 정확도 올리기" 선택 단계로 미루는 것을 권고.
4. **MBTI 완전 제거 vs 표시 유지** — 위 안은 필터에서만 제거. 사용자 애착이 큰 항목이라 완전 제거 시 반발 가능.
5. **지역 가중치** — `regionCovers`의 계층 포함 판정을 거리 점수로 바꾸려면 시/도·구 간 인접 테이블이 필요하다. 직선거리 근사로 갈지 인접 리스트를 손으로 만들지.
