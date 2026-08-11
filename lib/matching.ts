// lib/matching.ts — 추천/선호 필터 로직 (R5~R7, R16)
import { getSupabase } from "@/lib/supabase";
import { MAX_RANK } from "@/lib/constants";
import type { PreferencesRow, UserRow } from "@/lib/types";
import { parseJsonArray } from "@/lib/serialize";
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
  jobs: string[];
  keywords: string[]; // 선호 키워드(1~3). DB에서는 사용 안 하게 된 workplaces 컬럼을 재사용해 저장(DDL 회피).
  regions: string[];
  mbtis: string[];
}

export async function getPrefs(userId: string): Promise<Prefs | null> {
  const { data } = await getSupabase()
    .from("preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as PreferencesRow;
  return {
    genders: parseJsonArray(r.genders),
    age_min: r.age_min,
    age_max: r.age_max,
    jobs: parseJsonArray(r.jobs),
    // 근무지 수집이 폐지되어 workplaces 컬럼이 비었으므로, 선호 키워드 저장에 재사용한다.
    keywords: parseJsonArray(r.workplaces),
    regions: parseJsonArray(r.regions),
    mbtis: parseJsonArray(r.mbtis),
  };
}

// 하드 필터(성별/나이/직업/지역/MBTI). 키워드는 필터가 아니라 유사도 점수로만 반영한다.
export function fits(prefs: Prefs | null, u: UserRow): boolean {
  if (!prefs) return true; // 선호 미설정 = 제한 없음 (R24)
  if (prefs.genders.length && !prefs.genders.includes(u.gender ?? "")) return false;
  if (prefs.age_min && (!u.age || u.age < prefs.age_min)) return false;
  if (prefs.age_max && (!u.age || u.age > prefs.age_max)) return false;
  if (prefs.jobs.length && !prefs.jobs.includes(u.job ?? "")) return false;
  if (prefs.regions.length && !prefs.regions.includes(u.region ?? "")) return false;
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
//   - 내 선호 키워드가 상대 프로필에 얼마나 커버되나 (내가 원하는 걸 상대가 가짐)   ×3
//   - 상대 선호 키워드가 내 프로필에 얼마나 커버되나 (상대가 원하는 걸 내가 가짐, 상호) ×3
//   - 서로의 프로필 키워드 의미 공유                (공통 관심사)                    ×2
// 유의어(등산~캠핑, 와인~위스키)는 코사인으로 부분 점수를 받고, 무관/반대말은 임계값에서 걸린다.
export function keywordSimilarity(
  myKw: string[],
  myPrefKw: string[],
  theirKw: string[],
  theirPrefKw: string[]
): number {
  return 3 * softCover(myPrefKw, theirKw) + 3 * softCover(theirPrefKw, myKw) + 2 * softCover(myKw, theirKw);
}

export async function recommendationsFor(meId: string, me: UserRow): Promise<UserRow[]> {
  const sb = getSupabase();
  const { data: rows } = await sb
    .from("users")
    .select("*")
    .eq("role", "member")
    .eq("status", "active")
    .neq("id", meId);
  const myPrefs = await getPrefs(meId);
  const myKw = parseJsonArray(me.keywords);
  const myPrefKw = myPrefs?.keywords ?? [];

  const scored: { u: UserRow; sim: number }[] = [];
  for (const u of (rows as UserRow[]) ?? []) {
    if (await hasMatchHistory(meId, u.id)) continue; // R7
    if (await isAutoExcluded(meId, u.id)) continue; // R16
    if (!fits(myPrefs, u)) continue; // R6
    const theirPrefs = await getPrefs(u.id);
    if (!fits(theirPrefs, me)) continue; // R6 (상호)
    const sim = keywordSimilarity(
      myKw,
      myPrefKw,
      parseJsonArray(u.keywords),
      theirPrefs?.keywords ?? []
    );
    scored.push({ u, sim });
  }
  // 키워드 유사도 우선, 동점이면 신뢰점수·가입순
  scored.sort(
    (a, b) =>
      b.sim - a.sim ||
      b.u.trust_score - a.u.trust_score ||
      b.u.created_at - a.u.created_at
  );
  return scored.slice(0, MAX_RANK).map((x) => x.u);
}
