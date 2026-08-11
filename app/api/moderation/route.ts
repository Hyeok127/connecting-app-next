import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { genId, nowMs } from "@/lib/utils";
import { clientIp, ipAllowed } from "@/lib/ratelimit";

export const runtime = "nodejs";

// 차단/신고. 각각 blocks / reports 테이블에 기록한다(005 이전에는 point_events 인코딩).
const REPORT_REASONS = ["부적절한 프로필", "부적절한 사진", "불쾌한 대화", "사칭 의심", "기타"];

export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  // 신고/차단 행 무제한 삽입 방지
  if (!(await ipAllowed("moderation", clientIp(req), 30)))
    return fail("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", 429);

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

  // 차단은 (user_id, target_id) 유니크라 중복 삽입을 DB가 막아준다.
  const block = async () => {
    const { error } = await sb
      .from("blocks")
      .insert({ id: genId(), user_id: user.id, target_id: targetId, created_at: nowMs() });
    if (error && error.code !== "23505") throw new Error(error.message); // 23505=이미 차단됨
  };

  if (kind === "unblock") {
    await sb.from("blocks").delete().eq("user_id", user.id).eq("target_id", targetId);
    return ok({ ok: true, blocked: false });
  }

  try {
    if (kind === "block") {
      await block();
      return ok({ ok: true, blocked: true });
    }
    if (kind === "report") {
      const reason = REPORT_REASONS.includes(String(body.reason)) ? String(body.reason) : "기타";
      const { error } = await sb
        .from("reports")
        .insert({ id: genId(), reporter_id: user.id, target_id: targetId, reason, created_at: nowMs() });
      if (error) return fail(error.message, 400);
      await block(); // 신고와 동시에 차단해 추천에서 빠지게 함
      return ok({ ok: true });
    }
  } catch (e) {
    return fail((e as Error).message, 400);
  }

  return fail("알 수 없는 요청입니다.", 400);
}
