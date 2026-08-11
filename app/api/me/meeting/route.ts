import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { activeMeetingOf } from "@/lib/meeting";
import { publicUser, publicUserWithPhotos } from "@/lib/serialize";
import { CLOSE_REASONS } from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  const mt = await activeMeetingOf(user.id);
  if (!mt) return ok({ meeting: null, close_reasons: CLOSE_REASONS });

  const sb = getSupabase();
  const partner = await getUserById(mt.user_a === user.id ? mt.user_b : mt.user_a);
  if (!partner) return ok({ meeting: null, close_reasons: CLOSE_REASONS });

  const hasFb = async (uid: string) =>
    !!(await sb.from("feedbacks").select("1").eq("meeting_id", mt.id).eq("from_user", uid).maybeSingle()).data;

  // 사진은 매칭함과 동일하게 "양측 photo_consent"가 모두 있을 때만 공개한다.
  // (여기서 무조건 공개하면 상대가 동의하지 않아도 사진이 노출된다 — 서비스 약속 위반)
  const bothConsented = async () => {
    const { data: ev } = await sb.from("photo_consents").select("user_id").eq("match_id", mt.match_id);
    const s = new Set((ev ?? []).map((e) => e.user_id));
    return s.has(user.id) && s.has(partner.id);
  };

  const [exchanged, iResponded, partnerResponded] = await Promise.all([
    bothConsented(),
    hasFb(user.id),
    hasFb(partner.id),
  ]);
  const partnerPayload = exchanged ? await publicUserWithPhotos(partner) : publicUser(partner);

  return ok({
    meeting: {
      id: mt.id,
      started_at: mt.started_at,
      partner: partnerPayload,
      photos_exchanged: exchanged,
      i_responded: iResponded,
      partner_responded: partnerResponded, // 상대 선택 내용은 비공개
    },
    close_reasons: CLOSE_REASONS,
  });
}
