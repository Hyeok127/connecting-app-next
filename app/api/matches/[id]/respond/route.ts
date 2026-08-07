import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { expireOverdue } from "@/lib/batch";
import { genId, nowMs } from "@/lib/utils";
import { POINTS } from "@/lib/constants";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  const { id } = await ctx.params;
  await expireOverdue();

  const sb = getSupabase();
  const { data: m } = await sb.from("matches").select("*").eq("id", id).maybeSingle();
  const match = m as MatchRow | null;
  if (!match || (match.user_a !== user.id && match.user_b !== user.id))
    return fail("매칭을 찾을 수 없습니다.", 404);
  if (match.state !== "pending") return fail("이미 종료된 매칭입니다.", 409);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const action = body.action;
  const contact = body.contact;
  if (!["accept", "reject"].includes(String(action)))
    return fail("잘못된 응답입니다.", 400);

  const isA = match.user_a === user.id;
  const col = isA ? "a_response" : "b_response";
  const otherCol = isA ? "b_response" : "a_response";

  if (action === "accept") {
    const myContact = String(contact ?? user.contact ?? "").trim();
    if (!myContact)
      return fail("연락처를 입력해주세요. (카톡ID 또는 전화번호)", 400); // R12
    await sb.from("users").update({ contact: myContact }).eq("id", user.id);
    await sb.from("matches").update({ [col]: "accept" }).eq("id", match.id);

    if (match[otherCol as keyof MatchRow] === "accept") {
      // 쌍방 수락 → dating 락 + meeting 생성 + 포인트 + 다른 pending 정리
      await sb.from("matches").update({ state: "accepted", closed_at: nowMs() }).eq("id", match.id);
      await sb.from("users").update({ status: "dating" }).in("id", [match.user_a, match.user_b]);
      await sb.from("meetings").insert({
        id: genId(),
        match_id: match.id,
        status: "active",
        started_at: nowMs(),
      });
      // R13: dating 진입 시 다른 pending 전부 expired
      const { data: others } = await sb
        .from("matches")
        .select("id, user_a, user_b")
        .eq("state", "pending")
        .neq("id", match.id)
        .or(`user_a.in.(${match.user_a},${match.user_b}),user_b.in.(${match.user_a},${match.user_b})`);
      for (const o of others ?? []) {
        await sb.from("matches").update({ state: "expired", closed_at: nowMs() }).eq("id", o.id);
        await releaseUsers(o.user_a, o.user_b);
      }
      // R15: 쌍방 초대자 포인트
      for (const uid of [match.user_a, match.user_b]) {
        const u = await getUserById(uid);
        if (u?.invited_by)
          await sb.from("point_events").insert({
            id: genId(),
            user_id: u.invited_by,
            type: "match_success",
            points: POINTS.match_success,
            related_match_id: match.id,
            created_at: nowMs(),
          });
      }
      return ok({ ok: true, state: "accepted" });
    }
    return ok({ ok: true, state: "pending" });
  }

  // reject
  await sb
    .from("matches")
    .update({ [col]: "reject", state: "rejected", closed_at: nowMs() })
    .eq("id", match.id);
  await releaseUsers(match.user_a, match.user_b);
  return ok({ ok: true, state: "rejected" });
}

async function releaseUsers(a: string, b: string) {
  await getSupabase()
    .from("users")
    .update({ status: "active" })
    .eq("status", "match_pending")
    .in("id", [a, b]);
}
