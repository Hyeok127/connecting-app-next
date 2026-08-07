import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { clientIp, ipAllowed } from "@/lib/ratelimit";
import { createSignedUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

// 사진 직접 업로드를 위한 Signed Upload URL 발급.
// 가입 전(비로그인)에도 호출 가능하나 IP당 15분 20회로 제한.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await ipAllowed("upload", ip, 20)))
    return fail("업로드 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 429);

  const user = await authFromToken(bearerToken(req));

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const ext = String(body.ext ?? "jpg").replace(/^\./, "").toLowerCase();
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext))
    return fail("jpg, png, webp, gif 만 업로드 가능합니다.", 400);

  try {
    const { objectPath, uploadUrl } = await createSignedUploadUrl(user ? user.id : crypto.randomUUID().replace(/-/g, ""), ext);
    return ok({ objectPath, uploadUrl });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
