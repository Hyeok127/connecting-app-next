import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { activeMeetingOf, resolveMeeting } from "@/lib/meeting";
import { genId, nowMs } from "@/lib/utils";
import { CLOSE_REASONS } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  const mt = await activeMeetingOf(user.id);
  if (!mt) return fail("진행 중인 만남이 없습니다.", 404);

  const sb = getSupabase();
  const { data: already } = await sb
    .from("feedbacks")
    .select("1")
    .eq("meeting_id", mt.id)
    .eq("from_user", user.id)
    .maybeSingle();
  if (already) return fail("이미 응답했습니다.", 409);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const decision = body.decision;
  const reason_category = body.reason_category;
  const no_show = body.no_show;
  if (!["continue", "close"].includes(String(decision)))
    return fail("잘못된 선택입니다.", 400);
  if (decision === "close" && reason_category && !CLOSE_REASONS.includes(String(reason_category)))
    return fail("종료 사유가 올바르지 않습니다.", 400);

  const { error } = await sb.from("feedbacks").insert({
    id: genId(),
    meeting_id: mt.id,
    from_user: user.id,
    decision,
    reason_category: decision === "close" ? (String(reason_category ?? "") || null) : null,
    no_show: no_show ? 1 : 0,
    created_at: nowMs(),
  });
  if (error) return fail(error.message, 400);

  const resolved = await resolveMeeting(mt.id);
  const me = await getUserById(user.id);
  return ok({ ok: true, resolved, status: me?.status });
}
