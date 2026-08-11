import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

// 신고 목록(관리자). 신고는 point_events에 type='report|<사유>'로 기록돼 있음.
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const sb = getSupabase();
  const { data: events } = await sb
    .from("point_events")
    .select("user_id, related_match_id, type, created_at")
    .like("type", "report|%")
    .order("created_at", { ascending: false });
  const { data: users } = await sb.from("users").select("id, name");
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));

  const list = (events ?? []).map((e) => ({
    reporter_name: names.get(e.user_id) ?? "(탈퇴)",
    target_id: e.related_match_id,
    target_name: e.related_match_id ? names.get(e.related_match_id) ?? "(탈퇴)" : "-",
    reason: String(e.type).split("|")[1] ?? "기타",
    created_at: e.created_at,
  }));

  // 대상별 신고 횟수 요약
  const counts = new Map<string, number>();
  for (const l of list) if (l.target_id) counts.set(l.target_id, (counts.get(l.target_id) ?? 0) + 1);
  const withCount = list.map((l) => ({ ...l, target_report_count: l.target_id ? counts.get(l.target_id) ?? 1 : 1 }));

  return ok({ reports: withCount });
}
