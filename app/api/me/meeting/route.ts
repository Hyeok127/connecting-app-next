import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { activeMeetingOf } from "@/lib/meeting";
import { publicUserWithPhotos } from "@/lib/serialize";
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

  const [partnerWithPhotos, iResponded, partnerResponded] = await Promise.all([
    publicUserWithPhotos(partner),
    hasFb(user.id),
    hasFb(partner.id),
  ]);

  return ok({
    meeting: {
      id: mt.id,
      started_at: mt.started_at,
      partner: partnerWithPhotos,
      i_responded: iResponded,
      partner_responded: partnerResponded, // 상대 선택 내용은 비공개
    },
    close_reasons: CLOSE_REASONS,
  });
}
