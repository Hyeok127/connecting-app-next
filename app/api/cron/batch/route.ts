import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";
import { notifyMatchesForCycle } from "@/lib/notify";
import { pushMatchesForCycle } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json): 매일 11:00 UTC = 20:00 KST. R18
// ⚠ Vercel Cron은 GET으로 호출한다. 아래 `export const GET = POST`가 없으면
//   Next.js가 핸들러 전에 405를 반환해 배치가 영원히 실행되지 않는다.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Vercel이 붙이는 헤더는 `x-vercel-cron: 1`(값은 시크릿이 아님)이고,
  // 시크릿은 `Authorization: Bearer <CRON_SECRET>`으로 온다.
  const fromAuth = req.headers.get("authorization");
  const authorized = !!secret && fromAuth === `Bearer ${secret}`;

  if (!secret || !authorized)
    return fail("Forbidden", 403);

  try {
    const cycle = cycleDate();
    const result = await runBatch(cycle);
    // 새 매칭 알림(best-effort): 이메일 + 웹푸시
    await Promise.all([
      notifyMatchesForCycle(getSupabase(), cycle).catch(() => {}),
      pushMatchesForCycle(cycle).catch(() => {}),
    ]);
    console.log(`[cron/batch] cycle=${cycle} result=${result}`); // 실행 흔적(로그로 확인)
    return ok({ ok: true, cycle, result });
  } catch (e) {
    console.error("[cron/batch] 실패:", e);
    return fail((e as Error).message, 400);
  }
}

// Vercel Cron은 GET으로 호출하므로 동일 핸들러를 GET에도 연결한다.
export const GET = POST;
