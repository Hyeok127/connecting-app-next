// lib/values.ts — 가치관/라이프스타일 설문(차이가 크게 작용하는 차원).
// 각 항목은 선택(무응답 허용). 저장은 DDL 없이 users.workplace(근무지 폐지로 빈 컬럼)에
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

// 일치한 가치관 항목의 라벨(예: ["음주","종교"]) — 추천 사유 표시용.
export function matchedValueLabels(a: Record<string, string>, b: Record<string, string>): string[] {
  return VALUE_DIMENSIONS.filter((d) => a[d.key] && b[d.key] && a[d.key] === b[d.key]).map((d) => d.label);
}
