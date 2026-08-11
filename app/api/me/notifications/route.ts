import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";

// 앱 내 배지용 가벼운 알림 집계(읽기 전용).
//  - actionable: 내 응답을 기다리는 pending 매칭 수(마감 전) → 매칭함 배지
//  - matchIds:  현재 매칭 id 목록 → 클라이언트가 '새 매칭'(직전에 못 본 것) 개수 계산
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return ok({ actionable: 0, matchIds: [] });

  const now = Date.now();
  const { data } = await getSupabase()
    .from("matches")
    .select("id, user_a, user_b, state, a_response, b_response, respond_deadline")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  const rows = (data as MatchRow[] | null) ?? [];

  let actionable = 0;
  for (const m of rows) {
    if (m.state !== "pending") continue;
    if (m.respond_deadline <= now) continue; // 마감 지난 건 곧 만료 — 세지 않음
    const myResp = m.user_a === user.id ? m.a_response : m.b_response;
    if (myResp === "pending") actionable++;
  }

  return ok({ actionable, matchIds: rows.map((m) => m.id) });
}
