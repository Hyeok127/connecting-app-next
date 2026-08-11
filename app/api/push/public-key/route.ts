import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { getPublicKey } from "@/lib/push";

export const runtime = "nodejs";

// 클라이언트가 구독할 때 필요한 VAPID 공개키.
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  return ok({ publicKey: await getPublicKey() });
}
