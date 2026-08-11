import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

// 신고 목록(관리자).
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const sb = getSupabase();
  const { data: rows } = await sb
    .from("reports")
    .select("reporter_id, target_id, reason, created_at")
    .order("created_at", { ascending: false });
  const { data: users } = await sb.from("users").select("id, name");
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));

  const list = (rows ?? []).map((r) => ({
    reporter_name: names.get(r.reporter_id) ?? "(탈퇴)",
    target_id: r.target_id,
    target_name: names.get(r.target_id) ?? "(탈퇴)",
    reason: r.reason,
    created_at: r.created_at,
  }));

  // 대상별 신고 횟수 요약
  const counts = new Map<string, number>();
  for (const l of list) counts.set(l.target_id, (counts.get(l.target_id) ?? 0) + 1);
  return ok({ reports: list.map((l) => ({ ...l, target_report_count: counts.get(l.target_id) ?? 1 })) });
}
