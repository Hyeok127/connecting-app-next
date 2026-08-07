import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";

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
    return ok({ ok: true, cycle: cycleDate(), result });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
