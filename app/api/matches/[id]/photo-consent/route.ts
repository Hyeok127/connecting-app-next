import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { parseJsonArray } from "@/lib/serialize";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// 004: 매칭 성사 후 사진 교환 동의. 양측이 모두 동의해야 서로의 사진이 공개된다.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다.");

  const { id } = await ctx.params;
  const sb = getSupabase();
  const { data: m } = await sb.from("matches").select("*").eq("id", id).maybeSingle();
  const match = m as MatchRow | null;
  if (!match || (match.user_a !== user.id && match.user_b !== user.id))
    return fail("매칭을 찾을 수 없습니다.", 404);
  if (match.state !== "accepted")
    return fail("매칭이 성사된 뒤에 사진을 교환할 수 있습니다.", 409);

  // 동의하려면 내 사진이 등록돼 있어야 한다 (프로필에서 등록).
  if (parseJsonArray(user.photos).length === 0)
    return fail("먼저 프로필에서 사진을 등록해주세요.", 400);

  const isA = match.user_a === user.id;
  const col = isA ? "a_photo_consent" : "b_photo_consent";
  await sb.from("matches").update({ [col]: 1 }).eq("id", match.id);

  const partnerConsent = (isA ? match.b_photo_consent : match.a_photo_consent) === 1;
  return ok({ ok: true, photos_exchanged: partnerConsent });
}
