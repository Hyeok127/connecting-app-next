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

// ── 상대에게 바라는 가치관(선호) ──
// dim → 허용하는 상대 값들의 배열. 비었거나 없으면 "상관없음". preferences.value_prefs(jsonb).
export function cleanValuePrefs(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== "object") return out;
  for (const d of VALUE_DIMENSIONS) {
    const arr = (v as Record<string, unknown>)[d.key];
    if (Array.isArray(arr)) {
      const valid = [...new Set(arr.map((x) => String(x)))].filter((x) => d.options.some((o) => o.value === x));
      if (valid.length) out[d.key] = valid;
    }
  }
  return out;
}

// preferences.value_prefs(jsonb) 및 레거시 JSON 문자열 모두 허용.
export function parseValuePrefs(s?: string | Record<string, unknown> | null): Record<string, string[]> {
  if (!s) return {};
  if (typeof s === "object") return cleanValuePrefs(s);
  try {
    return cleanValuePrefs(JSON.parse(s));
  } catch {
    return {};
  }
}

// 내 선호(바라는 가치관)를 상대의 실제 값이 얼마나 충족하는지(항목 수).
export function valuePreferenceScore(myPrefs: Record<string, string[]>, theirVals: Record<string, string>): number {
  let n = 0;
  for (const d of VALUE_DIMENSIONS) {
    const acc = myPrefs[d.key];
    const tv = theirVals[d.key];
    if (acc && acc.length && tv && acc.includes(tv)) n++;
  }
  return n;
}

// 충족된 선호 항목을 상대의 실제 값과 함께 반환(사유 표시용): [{label:"종교", value:"무교"}].
export function satisfiedPrefReasons(myPrefs: Record<string, string[]>, theirVals: Record<string, string>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const d of VALUE_DIMENSIONS) {
    const acc = myPrefs[d.key];
    const tv = theirVals[d.key];
    if (acc && acc.length && tv && acc.includes(tv)) out.push({ label: d.label, value: tv });
  }
  return out;
}
