import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { nowMs, parseArr } from "@/lib/utils";
import { getPrefs } from "@/lib/matching";
import { cleanValuePrefs, parseValuePrefs } from "@/lib/values";
import { JOB_TYPES, JOB_ROLES } from "@/lib/profileOptions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  const prefs = await getPrefs(user.id);
  // 바라는 가치관은 preferences.value_prefs(jsonb) — 별도 필드로 내려줌
  const { data } = await getSupabase().from("preferences").select("value_prefs").eq("user_id", user.id).maybeSingle();
  return ok({ preferences: prefs, valuePrefs: parseValuePrefs(data?.value_prefs) });
}

export async function PUT(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  // 하드 필터(성별/나이/직장유형/직무/지역) + 바라는 가치관.
  const genders = parseArr(body.genders).filter((g) => ["남성", "여성"].includes(g));
  if (genders.length === 0) return fail("만나고 싶은 성별을 선택해주세요.", 400);

  // 나이 범위 검증 — 없으면 age_min > age_max 같은 공집합 설정이 조용히 저장되고
  // 사용자는 "추천이 없다"는 결과만 보게 된다. 빈 문자열은 "미설정"으로 본다.
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const ageMin = numOrNull(body.age_min);
  const ageMax = numOrNull(body.age_max);
  for (const [label, n] of [["최소", ageMin], ["최대", ageMax]] as const)
    if (n != null && (n < 19 || n > 99)) return fail(`${label} 나이는 19~99 사이여야 해요.`, 400);
  if (ageMin != null && ageMax != null && ageMin > ageMax)
    return fail("최소 나이가 최대 나이보다 클 수 없어요.", 400);

  const row = {
    user_id: user.id,
    genders: JSON.stringify(genders),
    age_min: ageMin,
    age_max: ageMax,
    job_types: parseArr(body.job_types).filter((x) => JOB_TYPES.includes(x as never)),
    job_roles: parseArr(body.job_roles).filter((x) => JOB_ROLES.includes(x as never)),
    value_prefs: cleanValuePrefs(body.value_prefs),
    regions: JSON.stringify(parseArr(body.regions)),
    mbtis: JSON.stringify(parseArr(body.mbtis)),
    updated_at: nowMs(),
  };
  const { error } = await getSupabase()
    .from("preferences")
    .upsert(row, { onConflict: "user_id" });
  if (error) return fail(error.message, 400);
  return ok({ ok: true });
}
