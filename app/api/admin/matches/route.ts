import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// 매칭 현황(관리자 모니터링). 최근 매칭 목록 + 상태별 집계 + 진행 중 만남 수.
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const sb = getSupabase();
  const [matchRes, usersRes, meetRes] = await Promise.all([
    sb.from("matches").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("users").select("id, name"),
    sb.from("meetings").select("match_id, status"),
  ]);
  const rows = (matchRes.data as MatchRow[]) ?? [];
  const names = new Map((usersRes.data ?? []).map((u) => [u.id, u.name]));
  const meetingByMatch = new Map((meetRes.data ?? []).map((m) => [m.match_id, m.status]));

  // 상태 집계
  const counts: Record<string, number> = { pending: 0, accepted: 0, rejected: 0, expired: 0 };
  for (const m of rows) counts[m.state] = (counts[m.state] ?? 0) + 1;
  const activeMeetings = (meetRes.data ?? []).filter((m) => m.status === "active").length;

  const list = rows.map((m) => ({
    id: m.id,
    cycle_date: m.cycle_date,
    a_name: names.get(m.user_a) ?? "(탈퇴)",
    b_name: names.get(m.user_b) ?? "(탈퇴)",
    state: m.state,
    a_response: m.a_response,
    b_response: m.b_response,
    score: m.score,
    respond_deadline: m.respond_deadline,
    created_at: m.created_at,
    meeting_status: meetingByMatch.get(m.id) ?? null, // active/closed/null
  }));

  return ok({
    matches: list,
    summary: { ...counts, active_meetings: activeMeetings, total: rows.length },
  });
}
