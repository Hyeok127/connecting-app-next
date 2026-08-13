import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { clientIp, ipAllowed } from "@/lib/ratelimit";
import { createSignedUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

// 사진 직접 업로드를 위한 Signed Upload URL 발급.
// 사진은 가입 시 받지 않고 로그인 상태에서만 올리므로 인증을 필수로 한다.
// (비로그인 허용 시 누구나 비공개 버킷에 업로드 URL을 발급받을 수 있었다)
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await ipAllowed("upload", ip, 20)))
    return fail("업로드 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 429);

  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();

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
    const { objectPath, uploadUrl, contentType } = await createSignedUploadUrl(user.id, ext);
    return ok({ objectPath, uploadUrl, contentType });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
