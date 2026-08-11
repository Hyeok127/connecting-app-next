import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById, revokeSessions } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { nowMs } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await authFromToken(bearerToken(req));
  if (!admin) return unauthorized();
  if (!admin.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const { id } = await ctx.params;
  const target = await getUserById(id);
  if (!target) return fail("유저를 찾을 수 없습니다.", 404);
  if (target.is_admin) return fail("관리자 계정은 정지할 수 없습니다.", 400);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const status = body.status;
  if (!["active", "suspended"].includes(String(status)))
    return fail("status는 active 또는 suspended만 가능합니다.", 400);
  const sb = getSupabase();

  // 만남 중이어도 정지할 수 있어야 한다(신고가 들어온 그 순간이 가장 급하다).
  // 진행 중 만남을 닫고 상대는 active로 돌려보낸다.
  if (status === "suspended" && target.status === "dating") {
    const { data: mts } = await sb
      .from("meetings")
      .select("id, match_id, matches!inner(user_a, user_b)")
      .eq("status", "active");
    for (const mt of mts ?? []) {
      const m = mt.matches as unknown as { user_a: string; user_b: string };
      if (m.user_a !== target.id && m.user_b !== target.id) continue;
      await sb.from("meetings").update({ status: "closed", closed_at: nowMs() }).eq("id", mt.id);
      const other = m.user_a === target.id ? m.user_b : m.user_a;
      await sb.from("users").update({ status: "active" }).eq("id", other);
    }
  }

  if (status === "suspended" && target.status === "match_pending") {
    // 대기 중인 매칭은 만료 처리하고 상대는 active 복귀
    const { data: pendings } = await sb
      .from("matches")
      .select("id, user_a, user_b")
      .eq("state", "pending")
      .or(`user_a.eq.${target.id},user_b.eq.${target.id}`);
    for (const m of pendings ?? []) {
      await sb.from("matches").update({ state: "expired", closed_at: nowMs() }).eq("id", m.id);
      await sb
        .from("users")
        .update({ status: "active" })
        .eq("status", "match_pending")
        .in("id", [m.user_a, m.user_b]);
    }
  }
  const { error } = await sb.from("users").update({ status }).eq("id", target.id);
  if (error) return fail(error.message, 400);
  // 정지하면 기존 세션(토큰)을 전부 파기한다. 안 그러면 로그인 상태로 계속 활동한다.
  if (status === "suspended") await revokeSessions(target.id);
  return ok({ ok: true, status });
}
