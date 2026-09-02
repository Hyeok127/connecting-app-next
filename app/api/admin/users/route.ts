import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { parseJsonArray } from "@/lib/serialize";
import { parseValues, parseValuePrefs, acceptedOnly } from "@/lib/values";
import type { PreferencesRow, UserRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const sb = getSupabase();
  const [usersRes, sumsRes, prefsRes] = await Promise.all([
    sb.from("users").select("*").order("created_at", { ascending: true }),
    sb.from("point_events").select("user_id, points"),
    sb.from("preferences").select("*"),
  ]);
  const users = (usersRes.data as UserRow[]) ?? [];
  const totals = new Map<string, number>();
  for (const s of sumsRes.data ?? []) totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + (s.points || 0));
  const names = new Map(users.map((u) => [u.id, u.name]));
  const prefsByUser = new Map((prefsRes.data as PreferencesRow[] ?? []).map((p) => [p.user_id, p]));

  const list = users.map((u) => {
    const p = prefsByUser.get(u.id);
    return {
      id: u.id,
      role: u.role,
      name: u.name,
      gender: u.gender,
      age: u.age,
      job_type: u.job_type,
      job_role: u.job_role,
      region: u.region,
      mbti: u.mbti,
      status: u.status,
      trust_score: u.trust_score,
      invite_code: u.invite_code,
      is_admin: !!u.is_admin,
      created_at: u.created_at,
      inviter_name: u.invited_by ? names.get(u.invited_by) ?? null : null,
      points: totals.get(u.id) ?? 0,
      // 프로필 상세(모니터링용)
      keywords: parseJsonArray(u.keywords),
      values: parseValues(u.life_values ?? u.workplace),
      photo_count: parseJsonArray(u.photos).length,
      email: u.email ?? null,
      contact: u.contact ?? null,
      consent_version: u.consent_version ?? null,
      prefs: p
        ? {
            genders: parseJsonArray(p.genders),
            age_min: p.age_min,
            age_max: p.age_max,
            job_types: Array.isArray(p.job_types) ? p.job_types : [],
            job_roles: Array.isArray(p.job_roles) ? p.job_roles : [],
            regions: parseJsonArray(p.regions),
            // 관리자 화면은 기존 표시 형식(dim → 허용값 배열)을 유지한다. 중요도는 별도 필드로 내려준다.
            value_prefs: acceptedOnly(parseValuePrefs(p.value_prefs ?? p.workplaces)),
            value_pref_importance: Object.fromEntries(
              Object.entries(parseValuePrefs(p.value_prefs ?? p.workplaces)).map(([k, v]) => [k, v.importance])
            ),
          }
        : null,
    };
  });

  return ok({ users: list });
}
