// lib/matching.ts — 추천/선호 필터 로직 (R5~R7, R16)
import { getSupabase } from "@/lib/supabase";
import { MAX_RANK } from "@/lib/constants";
import type { PreferencesRow, UserRow } from "@/lib/types";
import { parseJsonArray } from "@/lib/serialize";
import { parseValues, parseValuePrefs, valuePreferenceScore, satisfiedPrefReasons } from "@/lib/values";
import { regionCovers } from "@/lib/profileOptions";
import keywordVectors from "@/lib/keyword_vectors.json";

// 사전계산 임베딩(정규화+centering된 단위벡터). 런타임엔 이 벡터 코사인만 쓴다(API/모델 없음).
const VEC: Record<string, number[]> = (keywordVectors as { vectors: Record<string, number[]> }).vectors;
const SIM_THRESHOLD = 0.4; // 이 값 미만 코사인은 노이즈/반대말로 보고 무시

function cosOrExact(a: string, b: string): number {
  if (a === b) return 1;
  const va = VEC[a];
  const vb = VEC[b];
  if (!va || !vb) return 0; // 세트 밖(레거시 자유입력)이면 정확일치만 인정(위에서 처리)
  let dot = 0;
  for (let i = 0; i < va.length; i++) dot += va[i] * vb[i];
  return dot >= SIM_THRESHOLD ? dot : 0;
}

// A의 각 키워드가 B에 의미상 얼마나 커버되는지 합(각 항목의 최대 코사인, 임계값 이상만).
function softCover(A: string[], B: string[]): number {
  let sum = 0;
  for (const a of A) {
    let best = 0;
    for (const b of B) {
      const s = cosOrExact(a, b);
      if (s > best) best = s;
    }
    sum += best;
  }
  return sum;
}

export interface Prefs {
  genders: string[];
  age_min: number | null;
  age_max: number | null;
  jobTypes: string[]; // 바라는 직장유형
  jobRoles: string[]; // 바라는 직무
  regions: string[];
  mbtis: string[];
}

// jsonb 배열 또는 레거시 JSON 문자열 모두 허용.
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return parseJsonArray(v);
  return [];
}

function rowToPrefs(r: PreferencesRow): Prefs {
  return {
    genders: parseJsonArray(r.genders),
    age_min: r.age_min,
    age_max: r.age_max,
    jobTypes: asArray(r.job_types),
    jobRoles: asArray(r.job_roles),
    regions: parseJsonArray(r.regions),
    mbtis: parseJsonArray(r.mbtis),
  };
}

export async function getPrefs(userId: string): Promise<Prefs | null> {
  const { data } = await getSupabase()
    .from("preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? rowToPrefs(data as PreferencesRow) : null;
}

// 하드 필터(성별/나이/직업/지역/MBTI). 키워드는 필터가 아니라 유사도 점수로만 반영한다.
export function fits(prefs: Prefs | null, u: UserRow): boolean {
  if (!prefs) return true; // 선호 미설정 = 제한 없음 (R24)
  if (prefs.genders.length && !prefs.genders.includes(u.gender ?? "")) return false;
  if (prefs.age_min && (!u.age || u.age < prefs.age_min)) return false;
  if (prefs.age_max && (!u.age || u.age > prefs.age_max)) return false;
  if (prefs.jobTypes.length && !prefs.jobTypes.includes(u.job_type ?? "")) return false;
  if (prefs.jobRoles.length && !prefs.jobRoles.includes(u.job_role ?? "")) return false;
  // 지역은 시/도 선호가 그 안의 구/시를 커버(prefix). "서울"은 "서울 강남구"를 포함.
  if (prefs.regions.length && !prefs.regions.some((r) => regionCovers(r, u.region ?? ""))) return false;
  if (prefs.mbtis.length && u.mbti && !prefs.mbtis.includes(u.mbti)) return false;
  return true;
}

export async function hasMatchHistory(a: string, b: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("matches")
    .select("id")
    .or(`and(user_a.eq.${a},user_b.eq.${b}),and(user_a.eq.${b},user_b.eq.${a})`)
    .maybeSingle();
  return !!data;
}

// R16: 3사이클 이상 순위 등재됐으나 매칭 불발인 상대는 제외
export async function isAutoExcluded(meId: string, targetId: string): Promise<boolean> {
  const { count } = await getSupabase()
    .from("rankings")
    .select("cycle_date", { count: "exact", head: true })
    .eq("user_id", meId)
    .eq("target_id", targetId);
  return (count ?? 0) >= 3;
}

// 키워드 유사도 점수(높을수록 우선). 임베딩 코사인 소프트매칭의 가중합:
// 프로필 키워드 유사도(양방향 합). 유의어(등산~캠핑, 와인~위스키)는 코사인으로 부분 점수,
// 무관/반대말은 임계값(0.4)에서 걸린다.
export function keywordSimilarity(myKw: string[], theirKw: string[]): number {
  return softCover(myKw, theirKw) + softCover(theirKw, myKw);
}

const VALUE_WEIGHT = 1.0; // 가치관 한 항목 일치당 가산점 (키워드 유사도 보조)

// 추천 결과 + "왜 추천됐는지" 사유(점수·겹친 키워드·일치 가치관).
export interface Recommendation {
  user: UserRow;
  score: number;
  sharedKeywords: string[]; // 후보 키워드 중 내 키워드와 정확/유사(코사인≥0.4) 매칭된 것
  valueMatches: { label: string; value: string }[]; // 내 '바라는 가치관'을 충족한 상대 실제 값(예: 종교 무교)
}

export async function recommendationsFor(meId: string, me: UserRow): Promise<Recommendation[]> {
  const sb = getSupabase();
  // 후보 전체 + 필요한 부가정보를 "일괄 조회"한다(후보마다 개별 쿼리 X — N+1 제거).
  const { data: rows } = await sb
    .from("users")
    .select("*")
    .eq("role", "member")
    .eq("status", "active")
    .neq("id", meId);
  const candidates = (rows as UserRow[]) ?? [];
  const candIds = candidates.map((c) => c.id);

  const [myPrefRowRes, myMatches, myRanks, allPrefs, blocks] = await Promise.all([
    sb.from("preferences").select("*").eq("user_id", meId).maybeSingle(),
    sb.from("matches").select("user_a,user_b").or(`user_a.eq.${meId},user_b.eq.${meId}`), // R7: 매칭 이력
    sb.from("rankings").select("target_id").eq("user_id", meId), // R16: 3회 이상 등재
    candIds.length
      ? sb.from("preferences").select("*").in("user_id", candIds) // 상대 선호(상호 필터·가치관선호)
      : Promise.resolve({ data: [] as PreferencesRow[] }),
    // 차단: 내가 차단했거나 나를 차단한 관계 전부 제외
    sb.from("blocks").select("user_id,target_id").or(`user_id.eq.${meId},target_id.eq.${meId}`),
  ]);

  const myPrefRow = myPrefRowRes.data as PreferencesRow | null;
  const myPrefs = myPrefRow ? rowToPrefs(myPrefRow) : null; // 하드필터(성별/나이/직업/지역/MBTI)
  const myValuePrefs = parseValuePrefs(myPrefRow?.value_prefs ?? myPrefRow?.workplaces); // 바라는 가치관

  const historySet = new Set<string>();
  for (const m of (myMatches.data as { user_a: string; user_b: string }[]) ?? [])
    historySet.add(m.user_a === meId ? m.user_b : m.user_a);
  // 차단 관계는 양방향으로 제외
  for (const b of (blocks.data as { user_id: string; target_id: string }[]) ?? [])
    historySet.add(b.user_id === meId ? b.target_id : b.user_id);
  const rankCount = new Map<string, number>();
  for (const r of (myRanks.data as { target_id: string }[]) ?? [])
    rankCount.set(r.target_id, (rankCount.get(r.target_id) ?? 0) + 1);
  const prefsMap = new Map<string, Prefs>();
  const valuePrefsMap = new Map<string, Record<string, string[]>>();
  for (const p of (allPrefs.data as PreferencesRow[]) ?? []) {
    prefsMap.set(p.user_id, rowToPrefs(p));
    valuePrefsMap.set(p.user_id, parseValuePrefs(p.value_prefs ?? p.workplaces));
  }

  const myKw = parseJsonArray(me.keywords);
  const myVals = parseValues(me.life_values ?? me.workplace); // 나의 가치관

  const scored: (Recommendation & { sim: number })[] = [];
  for (const u of candidates) {
    if (historySet.has(u.id)) continue; // R7
    if ((rankCount.get(u.id) ?? 0) >= 3) continue; // R16
    if (!fits(myPrefs, u)) continue; // R6
    if (!fits(prefsMap.get(u.id) ?? null, me)) continue; // R6 (상호)
    const uKw = parseJsonArray(u.keywords);
    const uVals = parseValues(u.life_values ?? u.workplace);
    // 키워드는 유사할수록, 가치관은 "내가 바라는 조건을 상대가 충족"할수록(상호) 가산.
    const valueBonus =
      valuePreferenceScore(myValuePrefs, uVals) +
      valuePreferenceScore(valuePrefsMap.get(u.id) ?? {}, myVals);
    const sim = keywordSimilarity(myKw, uKw) + VALUE_WEIGHT * valueBonus;
    const sharedKeywords = uKw.filter((ck) => myKw.some((mk) => cosOrExact(ck, mk) > 0));
    // 사유: 내 바라는 가치관을 충족한 상대의 실제 값
    scored.push({ user: u, score: sim, sim, sharedKeywords, valueMatches: satisfiedPrefReasons(myValuePrefs, uVals) });
  }
  // 유사도 우선, 동점이면 신뢰점수·가입순
  scored.sort(
    (a, b) => b.sim - a.sim || b.user.trust_score - a.user.trust_score || b.user.created_at - a.user.created_at
  );
  return scored.slice(0, MAX_RANK).map(({ user, score, sharedKeywords, valueMatches }) => ({ user, score, sharedKeywords, valueMatches }));
}
