import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { saveSubscription, type PushSub } from "@/lib/push";

export const runtime = "nodejs";

// 브라우저 푸시 구독 등록.
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const sub = body.subscription as PushSub | undefined;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return fail("구독 정보가 올바르지 않습니다.", 400);
  await saveSubscription(user.id, sub);
  return ok({ ok: true });
}
