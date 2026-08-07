// lib/matching.ts — 추천/선호 필터 로직 (R5~R7, R16)
import { getSupabase } from "@/lib/supabase";
import { MAX_RANK } from "@/lib/constants";
import type { PreferencesRow, UserRow } from "@/lib/types";
import { parseJsonArray } from "@/lib/serialize";

export interface Prefs {
  genders: string[];
  age_min: number | null;
  age_max: number | null;
  jobs: string[];
  workplaces: string[];
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
    workplaces: parseJsonArray(r.workplaces),
    regions: parseJsonArray(r.regions),
    mbtis: parseJsonArray(r.mbtis),
  };
}

export function fits(prefs: Prefs | null, u: UserRow): boolean {
  if (!prefs) return true; // 선호 미설정 = 제한 없음 (R24)
  if (prefs.genders.length && !prefs.genders.includes(u.gender ?? "")) return false;
  if (prefs.age_min && (!u.age || u.age < prefs.age_min)) return false;
  if (prefs.age_max && (!u.age || u.age > prefs.age_max)) return false;
  if (prefs.jobs.length && !prefs.jobs.includes(u.job ?? "")) return false;
  if (prefs.workplaces.length && !prefs.workplaces.includes(u.workplace ?? "")) return false;
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

  const scored: { u: UserRow; overlap: number }[] = [];
  for (const u of (rows as UserRow[]) ?? []) {
    if (await hasMatchHistory(meId, u.id)) continue; // R7
    if (await isAutoExcluded(meId, u.id)) continue; // R16
    if (!fits(myPrefs, u)) continue; // R6
    if (!fits(await getPrefs(u.id), me)) continue; // R6 (상호)
    const kw = parseJsonArray(u.keywords);
    scored.push({ u, overlap: kw.filter((k) => myKw.includes(k)).length });
  }
  scored.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      b.u.trust_score - a.u.trust_score ||
      b.u.created_at - a.u.created_at
  );
  return scored.slice(0, MAX_RANK).map((x) => x.u);
}
