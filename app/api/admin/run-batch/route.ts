import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { runBatch } from "@/lib/batch";
import { cycleDate } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await authFromToken(bearerToken(req));
  if (!admin) return unauthorized();
  if (!admin.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25
  try {
    const result = await runBatch();
    return ok({ ok: true, cycle: cycleDate(), result });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
