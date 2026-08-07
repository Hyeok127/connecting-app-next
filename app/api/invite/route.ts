import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  const origin = req.nextUrl.origin;
  return ok({
    code: user.invite_code,
    link: `${origin}/?code=${user.invite_code}`,
  });
}
