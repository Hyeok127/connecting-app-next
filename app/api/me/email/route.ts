import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { getEmail, setEmail, isValidEmail } from "@/lib/notify";

export const runtime = "nodejs";

// 알림 이메일 조회
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  return ok({ email: await getEmail(user.id) });
}

// 알림 이메일 설정/해제(빈 값이면 해제)
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const email = String(body.email ?? "").trim();
  if (email && !isValidEmail(email)) return fail("이메일 형식이 올바르지 않습니다.", 400);
  await setEmail(user.id, email);
  return ok({ email: email || null });
}
