import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { nowMs, parseArr } from "@/lib/utils";
import { getPrefs } from "@/lib/matching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  const prefs = await getPrefs(user.id);
  return ok({ preferences: prefs }); // keywords 포함(workplaces 컬럼 재사용)
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
  // 선호 키워드(1~3)는 DDL 없이 저장하기 위해 사용 안 하게 된 workplaces 컬럼을 재사용한다.
  const prefKeywords = parseArr(body.keywords).slice(0, 3);
  const row = {
    user_id: user.id,
    genders: JSON.stringify(parseArr(body.genders).filter((g) => ["남성", "여성"].includes(g))),
    age_min: body.age_min ? Number(body.age_min) : null,
    age_max: body.age_max ? Number(body.age_max) : null,
    jobs: JSON.stringify(parseArr(body.jobs)),
    workplaces: JSON.stringify(prefKeywords), // ← 선호 키워드 저장 (컬럼 재사용)
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
