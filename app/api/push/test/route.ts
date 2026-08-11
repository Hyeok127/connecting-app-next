import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { pushToUsers } from "@/lib/push";

export const runtime = "nodejs";

// 본인에게 테스트 푸시 발송(설정 확인용).
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  await pushToUsers([user.id], {
    title: "알림이 잘 도착했어요 ✓",
    body: "이제 새 매칭이 오면 여기로 알려드릴게요.",
    url: "/home",
  });
  return ok({ ok: true });
}
