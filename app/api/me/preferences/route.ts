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
  const row = {
    user_id: user.id,
    genders: JSON.stringify(parseArr(body.genders).filter((g) => ["남성", "여성"].includes(g))),
    age_min: body.age_min ? Number(body.age_min) : null,
    age_max: body.age_max ? Number(body.age_max) : null,
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
