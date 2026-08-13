import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { cycleDate } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

// 관리자 대시보드 집계(참가자·추천 예정·매칭 단계·주선자·퍼널).
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const { data, error } = await getSupabase().rpc("admin_dashboard", { p_cycle: cycleDate() });
  if (error) return fail(error.message, 400);
  return ok({ dashboard: data });
}
