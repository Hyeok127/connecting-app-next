import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { expireOverdue } from "@/lib/batch";
import { publicUserWithPhotos } from "@/lib/serialize";
import { commonConnector } from "@/lib/invite";
import type { MatchRow, UserRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  await expireOverdue(); // 지연 만료 처리

  const sb = getSupabase();
  const { data: rows } = await sb
    .from("matches")
    .select("*")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const list: unknown[] = [];
  for (const m of (rows as MatchRow[]) ?? []) {
    const other = await getUserById(m.user_a === user.id ? m.user_b : m.user_a);
    if (!other) continue;
    const counterpart = await publicUserWithPhotos(other); // pending부터 사진 공개 §3-4
    const item: Record<string, unknown> = {
      id: m.id,
      state: m.state,
      my_response: m.user_a === user.id ? m.a_response : m.b_response,
      cycle_date: m.cycle_date,
      respond_deadline: m.respond_deadline,
      counterpart,
    };
    if (m.state === "accepted") {
      item.contact = (other as UserRow).contact; // R11
      item.common_connector = await commonConnector(m.user_a, m.user_b); // R23
    }
    list.push(item);
  }
  return ok({ matches: list });
}
