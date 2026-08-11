import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";
import { notifyMatchesForCycle } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron (vercel.json): 매일 11:00 UTC = 20:00 KST. R18
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const fromHeader = req.headers.get("x-vercel-cron");
  const fromAuth = req.headers.get("authorization");
  const authorized =
    (secret && fromHeader === secret) ||
    (secret && fromAuth === `Bearer ${secret}`);

  if (!secret || !authorized)
    return fail("Forbidden", 403);

  try {
    const result = await runBatch();
    const cycle = cycleDate();
    await notifyMatchesForCycle(getSupabase(), cycle).catch(() => {}); // 새 매칭 이메일 알림(best-effort)
    return ok({ ok: true, cycle, result });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
