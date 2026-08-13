import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";
import { notifyMatchesForCycle } from "@/lib/notify";
import { pushMatchesForCycle } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await authFromToken(bearerToken(req));
  if (!admin) return unauthorized();
  if (!admin.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25
  try {
    const cycle = cycleDate();
    const result = await runBatch(cycle);
    // 이번 사이클에 생성된 매칭 당사자에게 "새 매칭 도착" 알림(이메일 + 웹푸시, best-effort)
    await Promise.all([
      notifyMatchesForCycle(getSupabase(), cycle).catch(() => {}),
      pushMatchesForCycle(cycle).catch(() => {}),
    ]);
    return ok({ ok: true, cycle, result });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
