import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { genId, nowMs } from "@/lib/utils";

export const runtime = "nodejs";

// 차단/신고는 스키마 변경 없이 point_events에 이벤트로 기록(points=0).
//   차단:  type='block',  related_match_id=상대id
//   신고:  type='report|<사유>', related_match_id=상대id
const REPORT_REASONS = ["부적절한 프로필", "부적절한 사진", "불쾌한 대화", "사칭 의심", "기타"];

export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const targetId = String(body.target_id ?? "");
  const kind = String(body.kind ?? "");
  if (!targetId || targetId === user.id) return fail("대상이 올바르지 않습니다.", 400);

  const sb = getSupabase();

  if (kind === "block" || kind === "unblock") {
    if (kind === "unblock") {
      await sb.from("point_events").delete().eq("user_id", user.id).eq("type", "block").eq("related_match_id", targetId);
      return ok({ ok: true, blocked: false });
    }
    const { data: exists } = await sb
      .from("point_events")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "block")
      .eq("related_match_id", targetId)
      .maybeSingle();
    if (!exists) {
      await sb.from("point_events").insert({ id: genId(), user_id: user.id, type: "block", points: 0, related_match_id: targetId, created_at: nowMs() });
    }
    return ok({ ok: true, blocked: true });
  }

  if (kind === "report") {
    const reason = REPORT_REASONS.includes(String(body.reason)) ? String(body.reason) : "기타";
    await sb.from("point_events").insert({ id: genId(), user_id: user.id, type: `report|${reason}`, points: 0, related_match_id: targetId, created_at: nowMs() });
    // 신고와 동시에 차단도 걸어 추천에서 빠지게 함
    const { data: exists } = await sb.from("point_events").select("id").eq("user_id", user.id).eq("type", "block").eq("related_match_id", targetId).maybeSingle();
    if (!exists) await sb.from("point_events").insert({ id: genId(), user_id: user.id, type: "block", points: 0, related_match_id: targetId, created_at: nowMs() });
    return ok({ ok: true });
  }

  return fail("알 수 없는 요청입니다.", 400);
}
