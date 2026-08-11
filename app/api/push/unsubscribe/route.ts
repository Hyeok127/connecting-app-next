import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { removeSubscription } from "@/lib/push";

export const runtime = "nodejs";

// 브라우저 푸시 구독 해제.
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const endpoint = String(body.endpoint ?? "");
  if (!endpoint) return fail("endpoint가 필요합니다.", 400);
  await removeSubscription(user.id, endpoint);
  return ok({ ok: true });
}
