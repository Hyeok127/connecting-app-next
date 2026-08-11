import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { parseJsonArray } from "@/lib/serialize";
import { genId, nowMs } from "@/lib/utils";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// 매칭 성사 후 사진 교환 동의. 양측이 모두 동의해야 서로의 사진이 공개된다.
// 동의는 스키마 변경 없이 point_events(type='photo_consent', points=0)에 기록한다.
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

  // 내 동의 이벤트가 없으면 1회만 기록 (멱등)
  const { data: mine } = await sb
    .from("point_events")
    .select("id")
    .eq("type", "photo_consent")
    .eq("related_match_id", match.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mine) {
    await sb.from("point_events").insert({
      id: genId(),
      user_id: user.id,
      type: "photo_consent",
      points: 0,
      related_match_id: match.id,
      created_at: nowMs(),
    });
  }

  // 상대의 동의 여부 확인 → 둘 다면 교환 성립
  const otherId = match.user_a === user.id ? match.user_b : match.user_a;
  const { data: partner } = await sb
    .from("point_events")
    .select("id")
    .eq("type", "photo_consent")
    .eq("related_match_id", match.id)
    .eq("user_id", otherId)
    .maybeSingle();

  // (getUserById 불필요하지만 상대 존재 확인용은 생략 — 매칭이 이미 상대를 보증)
  return ok({ ok: true, photos_exchanged: !!partner });
}
