// lib/values.ts — 가치관/라이프스타일 설문(차이가 크게 작용하는 차원).
// 각 항목은 선택(무응답 허용). 저장은 users.life_values(jsonb)에
// JSON으로 기록한다. 매칭에서는 "같은 답이면 가산점"(취미 키워드는 유사도, 가치관은 일치).

// value: 저장·매칭에 쓰는 짧은 값. label: 선택 화면에 보이는 기준 포함 문구.
export interface ValueOption {
  value: string;
  label: string;
}
export interface ValueDimension {
  key: string;
  label: string;
  options: ValueOption[];
}

const O = (value: string, label?: string): ValueOption => ({ value, label: label ?? value });

export const VALUE_DIMENSIONS: ValueDimension[] = [
  {
    key: "smoke",
    label: "흡연",
    options: [O("비흡연"), O("가끔", "가끔 (월 몇 번·술자리 정도)"), O("자주", "자주 (거의 매일)"), O("전자담배")],
  },
  {
    key: "drink",
    label: "음주",
    options: [O("안 마심"), O("가볍게", "가볍게 (월 1~2회)"), O("즐기는 편", "즐기는 편 (주 1~2회)"), O("자주", "자주 (주 3회 이상)")],
  },
  {
    key: "tattoo",
    label: "문신",
    options: [O("없음"), O("작게", "작게 (평소 가려지는)"), O("크게", "크게·여러 개")],
  },
  {
    key: "religion",
    label: "종교",
    options: [O("무교"), O("기독교"), O("천주교"), O("불교"), O("기타")],
  },
];

export const VALUE_KEYS = VALUE_DIMENSIONS.map((d) => d.key);
const OPTION_SET: Record<string, Set<string>> = Object.fromEntries(
  VALUE_DIMENSIONS.map((d) => [d.key, new Set(d.options.map((o) => o.value))])
);

// 유효한 (key, option) 쌍만 남긴다. 무응답/빈값/미허용값은 제거.
export function cleanValues(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const key of VALUE_KEYS) {
    const raw = (v as Record<string, unknown>)[key];
    const val = typeof raw === "string" ? raw.trim() : "";
    if (val && OPTION_SET[key].has(val)) out[key] = val;
  }
  return out;
}

// 저장값 → 객체. users.life_values(jsonb 객체)와 레거시 JSON 문자열을 모두 받는다.
export function parseValues(s?: string | Record<string, unknown> | null): Record<string, string> {
  if (!s) return {};
  if (typeof s === "object") return cleanValues(s);
  try {
    return cleanValues(JSON.parse(s));
  } catch {
    return {};
  }
}

// ── 상대에게 바라는 가치관(선호) + 중요도 ──
//
// 예전 저장 형식은 dim → 허용값 배열이었다. 그래서 "종교는 반드시 무교"인 사람과
// "문신은 없는 편이 좋다" 정도인 사람이 **똑같이 1점**을 받았다 — 이상형에서 무엇이
// 중요하고 무엇이 사소한지가 데이터에 없었다. 항목마다 중요도를 함께 받는다.
//
// 저장은 preferences.value_prefs(jsonb). 컬럼이 이미 jsonb라 DDL 없이 형태만 바꾼다.
//   구형: { "smoke": ["비흡연"] }
//   신형: { "smoke": { "accepted": ["비흡연"], "importance": 3 } }
// 구형 값은 읽을 때 importance 1(있으면 좋음)로 승격하므로 마이그레이션이 필요 없다.

export const IMPORTANCE_LABELS: Record<number, string> = {
  0: "상관없음",
  1: "있으면 좋음",
  2: "중요",
  3: "절대조건",
};

// 절대조건은 상한을 둔다. 무제한 허용하면 후보풀이 수학적으로 0이 된다.
export const MAX_DEALBREAKERS = 3;

// 점수 가중치. 3(절대조건)은 하드필터에서 이미 걸러지므로 점수 가산은 0이다 —
// 통과한 후보는 전원 충족한 상태라 변별력이 없고, 넣으면 이중 계상이 된다.
const IMPORTANCE_WEIGHT: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 0 };

export interface ValuePref {
  accepted: string[];
  importance: 0 | 1 | 2 | 3;
}
export type ValuePrefs = Record<string, ValuePref>;

function normImportance(v: unknown): 0 | 1 | 2 | 3 {
  const n = Math.trunc(Number(v));
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : 1;
}

// 구형(배열)·신형(객체)을 모두 받아 신형으로 정규화한다.
export function cleanValuePrefs(v: unknown): ValuePrefs {
  const out: ValuePrefs = {};
  if (!v || typeof v !== "object") return out;
  let dealbreakers = 0;
  for (const d of VALUE_DIMENSIONS) {
    const raw = (v as Record<string, unknown>)[d.key];
    if (raw == null) continue;

    let accepted: unknown;
    let importance: 0 | 1 | 2 | 3;
    if (Array.isArray(raw)) {
      accepted = raw;
      importance = 1; // 구형 저장분 — "있으면 좋음"으로 승격
    } else if (typeof raw === "object") {
      accepted = (raw as Record<string, unknown>).accepted;
      importance = normImportance((raw as Record<string, unknown>).importance);
    } else continue;

    if (!Array.isArray(accepted)) continue;
    const valid = [...new Set(accepted.map((x) => String(x)))].filter((x) =>
      d.options.some((o) => o.value === x)
    );
    if (!valid.length) continue; // 허용값이 없으면 "상관없음"과 같다

    // 절대조건 상한 초과분은 거절하지 않고 "중요"로 강등한다.
    // (저장 시점에 튕기면 사용자가 무엇을 잃었는지 모른 채 실패한다)
    if (importance === 3) {
      if (dealbreakers >= MAX_DEALBREAKERS) importance = 2;
      else dealbreakers++;
    }
    out[d.key] = { accepted: valid, importance };
  }
  return out;
}

// preferences.value_prefs(jsonb) 및 레거시 JSON 문자열 모두 허용.
export function parseValuePrefs(s?: string | Record<string, unknown> | null): ValuePrefs {
  if (!s) return {};
  if (typeof s === "object") return cleanValuePrefs(s);
  try {
    return cleanValuePrefs(JSON.parse(s));
  } catch {
    return {};
  }
}

// 표시·집계용 — 중요도를 뺀 허용값만 필요한 곳(관리자 화면, 프로필 완성도)에서 쓴다.
export function acceptedOnly(prefs: ValuePrefs): Record<string, string[]> {
  return Object.fromEntries(Object.entries(prefs).map(([k, p]) => [k, p.accepted]));
}

// 절대조건(importance=3) 위반 여부 — 하드필터용.
//
// 상대가 그 항목에 답하지 않았으면 거르지 않는다. 가치관 설문이 선택 항목이라
// 미응답자를 전부 배제하면 후보풀이 무너지기 때문이다. 즉 "절대조건"은
// **알려진 불일치**만 막는다. 이 한계는 선호 입력 화면에서 사용자에게 알려야 한다.
// (근본 해결은 가치관 설문을 필수로 만드는 것 — SURVEY_V2.md 참고)
export function violatesDealbreaker(myPrefs: ValuePrefs, theirVals: Record<string, string>): boolean {
  for (const d of VALUE_DIMENSIONS) {
    const p = myPrefs[d.key];
    if (!p || p.importance !== 3 || !p.accepted.length) continue;
    const tv = theirVals[d.key];
    if (tv && !p.accepted.includes(tv)) return true;
  }
  return false;
}

// 내 선호를 상대가 얼마나 충족하는지 — 중요도로 가중한 합.
export function valuePreferenceScore(myPrefs: ValuePrefs, theirVals: Record<string, string>): number {
  let n = 0;
  for (const d of VALUE_DIMENSIONS) {
    const p = myPrefs[d.key];
    const tv = theirVals[d.key];
    if (p && p.accepted.length && tv && p.accepted.includes(tv)) n += IMPORTANCE_WEIGHT[p.importance];
  }
  return n;
}

// 충족된 선호 항목을 상대의 실제 값과 함께 반환(사유 표시용): [{label:"종교", value:"무교"}].
export function satisfiedPrefReasons(
  myPrefs: ValuePrefs,
  theirVals: Record<string, string>
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const d of VALUE_DIMENSIONS) {
    const p = myPrefs[d.key];
    const tv = theirVals[d.key];
    if (p && p.accepted.length && tv && p.accepted.includes(tv)) out.push({ label: d.label, value: tv });
  }
  return out;
}
