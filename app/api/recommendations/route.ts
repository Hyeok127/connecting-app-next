import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { recommendationsFor } from "@/lib/matching";
import { publicUser } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4
  if (user.status === "suspended") return forbidden("정지된 계정입니다. 운영자에게 문의해주세요."); // R26
  if (user.status === "dating") return ok({ candidates: [] }); // R14

  // publicUser에 photos/contact 미포함 (R5)
  const candidates = (await recommendationsFor(user.id, user)).map((u) => publicUser(u));
  return ok({ candidates });
}
