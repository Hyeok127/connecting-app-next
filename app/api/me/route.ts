import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { parseArr, PHOTO_PATH_RE } from "@/lib/utils";
import { PHOTO_BUCKET } from "@/lib/constants";
import { parseJsonArray, publicUserWithPhotos } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  const sb = getSupabase();
  const { data: sums } = await sb.from("point_events").select("points").eq("user_id", user.id);
  const points = (sums ?? []).reduce((s, r) => s + (r.points || 0), 0);
  const me = await publicUserWithPhotos(user);
  (me as unknown as Record<string, unknown>).contact = user.contact;
  return ok({
    user: {
      ...me,
      invite_code: user.invite_code,
      points,
      trust_score: user.trust_score,
      is_admin: !!user.is_admin,
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }

  const sb = getSupabase();
  const sets: Record<string, unknown> = {};

  if (user.role === "member") {
    if (body.name !== undefined) sets.name = String(body.name).trim();
    if (body.age !== undefined) sets.age = body.age ? Number(body.age) : null;
    if (body.gender && ["남성", "여성"].includes(String(body.gender))) sets.gender = String(body.gender);
    if (body.mbti !== undefined) sets.mbti = String(body.mbti).trim().toUpperCase() || null;
    for (const f of ["job", "workplace", "region", "contact"] as const) {
      if (body[f] !== undefined) sets[f] = String(body[f]).trim() || null;
    }
    if (body.keywords !== undefined) {
      const kw = parseArr(body.keywords);
      if (kw.length !== 3) return fail("키워드는 정확히 3개 입력해주세요.", 400);
      sets.keywords = JSON.stringify(kw);
    }
    if (body.photos !== undefined) {
      const photos = parseArr(body.photos);
      if (photos.length < 1 || photos.length > 3) return fail("사진을 1~3장 올려주세요.", 400);
      if (!photos.every((p) => PHOTO_PATH_RE.test(p))) return fail("사진 경로가 올바르지 않습니다.", 400);
      const oldPaths = parseJsonArray(user.photos).filter((p) => !photos.includes(p));
      sets.photos = JSON.stringify(photos);
      // 이전 사진 정리 (best-effort)
      if (oldPaths.length) {
        await sb.storage.from(PHOTO_BUCKET).remove(oldPaths).catch(() => {});
      }
    }
  } else {
    // bridge: 이름/PIN만
    if (body.name !== undefined) sets.name = String(body.name).trim();
  }

  if (Object.keys(sets).length === 0) return fail("변경할 항목이 없습니다.", 400);

  const { error } = await sb.from("users").update(sets).eq("id", user.id);
  if (error) {
    if (error.code === "23505") return fail("이미 사용 중인 이름입니다.", 409);
    return fail(error.message, 400);
  }
  const updated = await getUserById(user.id);
  const me = await publicUserWithPhotos(updated!);
  (me as unknown as Record<string, unknown>).contact = updated!.contact;
  return ok({ user: me });
}
