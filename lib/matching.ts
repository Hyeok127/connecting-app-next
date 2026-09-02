// lib/matching.ts — 추천/선호 필터 로직 (R5~R7, R16)
import { getSupabase } from "@/lib/supabase";
import { MAX_RANK } from "@/lib/constants";
import type { PreferencesRow, UserRow } from "@/lib/types";
import { parseJsonArray } from "@/lib/serialize";
import { parseValues, parseValuePrefs, valuePreferenceScore, satisfiedPrefReasons, violatesDealbreaker, type ValuePrefs } from "@/lib/values";
import { regionCovers } from "@/lib/profileOptions";
import { cycleDate } from "@/lib/utils";
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

export const oppositeGender = (g: string | null): string | null =>
  g === "남성" ? "여성" : g === "여성" ? "남성" : null;

// 동점 tie-break용 결정론적 해시(FNV-1a). (user_id, 사이클날짜) → 안정적 정수.
// 난수가 아니라 해시인 이유: 같은 날 같은 사용자가 새로고침해도 순서가 흔들리면 안 된다.
function rotationKey(id: string, salt: string): number {
  let h = 0x811c9dc5;
  const s = `${id}|${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// 하드 필터(성별/나이/직업/지역). 키워드는 필터가 아니라 유사도 점수로만 반영한다.
//
// `viewer`는 이 선호의 주인이다. 성별만은 선호 미설정이어도 필터하기 위해 받는다.
export function fits(prefs: Prefs | null, u: UserRow, viewer?: UserRow | null): boolean {
  // ── 성별: R24("선호 미설정 = 제한 없음")의 유일한 예외 ──
  // 가입 시 pref_genders가 선택 항목이라 미설정 회원이 존재하고, 그 경우 예전에는
  // 성별 필터가 통째로 사라져 추천 10칸의 절반이 동성으로 찼다. 미설정이면 이성으로
  // 폴백한다. (신규 가입은 pref_genders를 필수로 받으므로 기존 이월분에만 해당)
  const wantedGenders = prefs?.genders ?? [];
  if (wantedGenders.length) {
    if (!wantedGenders.includes(u.gender ?? "")) return false;
  } else {
    const fallback = oppositeGender(viewer?.gender ?? null);
    if (fallback && u.gender !== fallback) return false;
  }

  if (!prefs) return true; // 성별 외 나머지는 미설정 = 제한 없음 (R24)

  // 0을 "미설정"으로 삼키지 않도록 null 비교로 판정한다.
  if (prefs.age_min != null && (u.age == null || u.age < prefs.age_min)) return false;
  if (prefs.age_max != null && (u.age == null || u.age > prefs.age_max)) return false;

  // 미기입(null)은 "불일치"가 아니라 "정보 없음"으로 본다 — 하드필터에서 떨어뜨리지 않고
  // 점수 가산만 못 받게 한다. (이전에는 job_*/region이 `?? ""`로 탈락하고 mbti만 통과해
  //  축마다 방향이 반대였고, 빈칸일수록 노출이 늘어나는 역인센티브가 있었다)
  if (prefs.jobTypes.length && u.job_type && !prefs.jobTypes.includes(u.job_type)) return false;
  if (prefs.jobRoles.length && u.job_role && !prefs.jobRoles.includes(u.job_role)) return false;
  // 지역은 시/도 선호가 그 안의 구/시를 커버(prefix). "서울"은 "서울 강남구"를 포함.
  if (prefs.regions.length && u.region && !prefs.regions.some((r) => regionCovers(r, u.region!))) return false;

  // MBTI는 하드필터에서 제외했다(표시 전용). 16칸 완전일치를 상호 조건으로 곱하면
  // 초대제 폐쇄망의 작은 모수에서 후보풀이 실질 0이 된다. 필요하면 점수 축으로 되살릴 것.
  return true;
}

// (제거됨) hasMatchHistory / isAutoExcluded
//   N+1 제거(293d787) 때 recommendationsFor 안에서 일괄 조회로 인라인화되면서
//   호출처가 0이 됐는데, `.maybeSingle()`이 다중행에서 에러를 내고 그 에러를
//   구조분해에서 버려 "이력 없음"으로 fail-open 하는 버그를 안은 채 남아 있었다.
//   되살릴 일이 있으면 historySet/rankCount 방식(아래)을 그대로 쓸 것.

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
  const valuePrefsMap = new Map<string, ValuePrefs>();
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
    if (!fits(myPrefs, u, me)) continue; // R6
    if (!fits(prefsMap.get(u.id) ?? null, me, u)) continue; // R6 (상호)
    const uKw = parseJsonArray(u.keywords);
    const uVals = parseValues(u.life_values ?? u.workplace);
    // 절대조건(importance=3) 위반은 양방향으로 제외한다.
    // 나머지 중요도는 아래 valueBonus에서 가중 가산으로만 반영된다.
    if (violatesDealbreaker(myValuePrefs, uVals)) continue;
    if (violatesDealbreaker(valuePrefsMap.get(u.id) ?? {}, myVals)) continue;
    // 키워드는 유사할수록, 가치관은 "내가 바라는 조건을 상대가 충족"할수록(상호) 가산.
    const valueBonus =
      valuePreferenceScore(myValuePrefs, uVals) +
      valuePreferenceScore(valuePrefsMap.get(u.id) ?? {}, myVals);
    const sim = keywordSimilarity(myKw, uKw) + VALUE_WEIGHT * valueBonus;
    const sharedKeywords = uKw.filter((ck) => myKw.some((mk) => cosOrExact(ck, mk) > 0));
    // 사유: 내 바라는 가치관을 충족한 상대의 실제 값
    scored.push({ user: u, score: sim, sim, sharedKeywords, valueMatches: satisfiedPrefReasons(myValuePrefs, uVals) });
  }
  // 유사도 우선, 동점이면 신뢰점수, 그 다음은 사이클별 결정론적 셔플.
  // (가입순으로 떨어뜨리면 오래된 회원이 구조적으로 영구 비노출된다. 키워드·가치관을
  //  아직 안 채운 회원은 sim이 전부 0이라 동점 집단이 크고, MAX_RANK로 잘리기 때문이다.
  //  같은 날엔 순서가 안정적이고, 날짜가 바뀌면 노출 순서가 돈다.)
  const salt = cycleDate();
  scored.sort(
    (a, b) =>
      b.sim - a.sim ||
      b.user.trust_score - a.user.trust_score ||
      rotationKey(a.user.id, salt) - rotationKey(b.user.id, salt)
  );
  return scored.slice(0, MAX_RANK).map(({ user, score, sharedKeywords, valueMatches }) => ({ user, score, sharedKeywords, valueMatches }));
}
