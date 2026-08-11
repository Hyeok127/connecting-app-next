import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { expireOverdue } from "@/lib/batch";
import { publicUser, publicUserWithPhotos } from "@/lib/serialize";
import { commonConnector } from "@/lib/invite";
import type { MatchRow, UserRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  await expireOverdue(); // 지연 만료 처리

  const sb = getSupabase();
  const { data: rows } = await sb
    .from("matches")
    .select("*")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const matchRows = (rows as MatchRow[]) ?? [];

  // 사진 교환 동의는 스키마 변경(DDL) 없이 point_events에 이벤트로 기록한다.
  // type='photo_consent', related_match_id=매칭, user_id=동의자. 매칭당 양측 이벤트가
  // 모두 있으면 교환 성립. (기존 포인트 합산엔 points=0이라 영향 없음)
  const consentByMatch = new Map<string, Set<string>>();
  const ids = matchRows.map((m) => m.id);
  if (ids.length) {
    const { data: ev } = await sb
      .from("point_events")
      .select("user_id, related_match_id")
      .eq("type", "photo_consent")
      .in("related_match_id", ids);
    for (const e of ev ?? []) {
      if (!e.related_match_id) continue;
      const s = consentByMatch.get(e.related_match_id) ?? new Set<string>();
      s.add(e.user_id);
      consentByMatch.set(e.related_match_id, s);
    }
  }

  const list: unknown[] = [];
  for (const m of matchRows) {
    const isA = m.user_a === user.id;
    const other = await getUserById(isA ? m.user_b : m.user_a);
    if (!other) continue;
    // 사진은 매칭 성사 후 양측이 모두 교환에 동의했을 때만 공개한다.
    const consented = consentByMatch.get(m.id) ?? new Set<string>();
    const myConsent = consented.has(user.id);
    const partnerConsent = consented.has(other.id);
    const exchanged = m.state === "accepted" && myConsent && partnerConsent;
    const counterpart = exchanged
      ? await publicUserWithPhotos(other)
      : publicUser(other);
    const item: Record<string, unknown> = {
      id: m.id,
      state: m.state,
      my_response: isA ? m.a_response : m.b_response,
      cycle_date: m.cycle_date,
      respond_deadline: m.respond_deadline,
      my_photo_consent: myConsent,
      partner_photo_consent: partnerConsent,
      photos_exchanged: exchanged,
      counterpart,
    };
    if (m.state === "accepted") {
      item.contact = (other as UserRow).contact; // R11
      item.common_connector = await commonConnector(m.user_a, m.user_b); // R23
    }
    list.push(item);
  }
  return ok({ matches: list });
}
