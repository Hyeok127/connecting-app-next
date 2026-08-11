// lib/values.ts — 가치관/라이프스타일 설문(차이가 크게 작용하는 차원).
// 각 항목은 선택(무응답 허용). 저장은 DDL 없이 users.workplace(근무지 폐지로 빈 컬럼)에
// JSON으로 기록한다. 매칭에서는 "같은 답이면 가산점"(취미 키워드는 유사도, 가치관은 일치).

export interface ValueDimension {
  key: string;
  label: string;
  options: string[];
}

export const VALUE_DIMENSIONS: ValueDimension[] = [
  { key: "smoke", label: "흡연", options: ["비흡연", "가끔", "흡연", "전자담배"] },
  { key: "drink", label: "음주", options: ["안 마심", "가끔", "즐김"] },
  { key: "tattoo", label: "문신", options: ["없음", "있음"] },
  { key: "religion", label: "종교", options: ["무교", "기독교", "천주교", "불교", "기타"] },
];

export const VALUE_KEYS = VALUE_DIMENSIONS.map((d) => d.key);
const OPTION_SET: Record<string, Set<string>> = Object.fromEntries(
  VALUE_DIMENSIONS.map((d) => [d.key, new Set(d.options)])
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

// 저장 문자열(JSON) → 객체
export function parseValues(s?: string | null): Record<string, string> {
  if (!s) return {};
  try {
    return cleanValues(JSON.parse(s));
  } catch {
    return {};
  }
}

// 두 사람의 가치관 일치 개수(둘 다 응답한 항목 중 같은 답).
export function valueAgreement(a: Record<string, string>, b: Record<string, string>): number {
  let n = 0;
  for (const key of VALUE_KEYS) if (a[key] && b[key] && a[key] === b[key]) n++;
  return n;
}
