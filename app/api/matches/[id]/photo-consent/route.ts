import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { parseJsonArray } from "@/lib/serialize";
import { nowMs } from "@/lib/utils";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// 매칭 성사 후 사진 교환 동의. 양측이 모두 동의해야 서로의 사진이 공개된다.
// 동의는 photo_consents 테이블에 (match_id, user_id) 한 행으로 기록한다.
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

  // 내 동의 기록 (PK가 (match_id,user_id)라 중복 삽입은 DB가 막는다 — 멱등)
  const { error } = await sb
    .from("photo_consents")
    .insert({ match_id: match.id, user_id: user.id, created_at: nowMs() });
  if (error && error.code !== "23505") return fail(error.message, 400);

  // 상대의 동의 여부 확인 → 둘 다면 교환 성립
  const otherId = match.user_a === user.id ? match.user_b : match.user_a;
  const { data: partner } = await sb
    .from("photo_consents")
    .select("user_id")
    .eq("match_id", match.id)
    .eq("user_id", otherId)
    .maybeSingle();

  return ok({ ok: true, photos_exchanged: !!partner });
}

// 사진 교환 동의 철회 (P1-2).
// 한 번 동의하면 되돌릴 수단이 없어서, 마음이 바뀌거나 상대가 불편해져도
// 사진이 계속 공개된 채로 남았다. 내 동의 행을 지우면 교환이 즉시 해제된다
// (매칭함·만남 화면 모두 "양측 동의"를 매 요청 재계산하므로 별도 전파가 필요 없다).
//
// 이미 상대가 내려받아 저장한 사진까지 회수할 수는 없다 — 그건 기술로 막을 수 없고,
// 동의 화면에서 그 사실을 미리 알려야 한다.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다.");

  const { id } = await ctx.params;
  const sb = getSupabase();
  const { data: m } = await sb.from("matches").select("*").eq("id", id).maybeSingle();
  const match = m as MatchRow | null;
  if (!match || (match.user_a !== user.id && match.user_b !== user.id))
    return fail("매칭을 찾을 수 없습니다.", 404);

  const { error } = await sb
    .from("photo_consents")
    .delete()
    .eq("match_id", match.id)
    .eq("user_id", user.id);
  if (error) return fail(error.message, 400);

  return ok({ ok: true, photos_exchanged: false });
}
