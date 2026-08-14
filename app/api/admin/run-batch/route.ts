import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";
import { notifyMatchesForCycle } from "@/lib/notify";
import { pushMatchesForCycle } from "@/lib/push";
import { recordMatchFeatures, takeSnapshot } from "@/lib/analytics";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await authFromToken(bearerToken(req));
  if (!admin) return unauthorized();
  if (!admin.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25
  try {
    const cycle = cycleDate();
    const result = await runBatch(cycle);
    await recordMatchFeatures(cycle).catch(() => {}); // 성사요인 기록
    await Promise.all([
      notifyMatchesForCycle(getSupabase(), cycle).catch(() => {}),
      pushMatchesForCycle(cycle).catch(() => {}),
    ]);
    await takeSnapshot(cycle, "auto").catch(() => {}); // 배치 후 자동 스냅샷
    return ok({ ok: true, cycle, result });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
