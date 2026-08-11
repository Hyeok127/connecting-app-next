import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { expireOverdue } from "@/lib/batch";
import { genId, nowMs } from "@/lib/utils";
import { POINTS } from "@/lib/constants";
import { notifyUser } from "@/lib/notify";
import { pushToUsers } from "@/lib/push";
import type { MatchRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4

  const { id } = await ctx.params;
  await expireOverdue();

  const sb = getSupabase();
  const { data: m } = await sb.from("matches").select("*").eq("id", id).maybeSingle();
  const match = m as MatchRow | null;
  if (!match || (match.user_a !== user.id && match.user_b !== user.id))
    return fail("매칭을 찾을 수 없습니다.", 404);
  if (match.state !== "pending") return fail("이미 종료된 매칭입니다.", 409);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const action = body.action;
  const contact = body.contact;
  if (!["accept", "reject"].includes(String(action)))
    return fail("잘못된 응답입니다.", 400);

  const isA = match.user_a === user.id;
  const col = isA ? "a_response" : "b_response";
  const otherCol = isA ? "b_response" : "a_response";

  if (action === "accept") {
    const myContact = String(contact ?? user.contact ?? "").trim();
    if (!myContact)
      return fail("연락처를 입력해주세요. (카톡ID 또는 전화번호)", 400); // R12
    await sb.from("users").update({ contact: myContact }).eq("id", user.id);
    await sb.from("matches").update({ [col]: "accept" }).eq("id", match.id);

    if (match[otherCol as keyof MatchRow] === "accept") {
      // 쌍방 수락 → dating 락 + meeting 생성 + 포인트 + 다른 pending 정리
      await sb.from("matches").update({ state: "accepted", closed_at: nowMs() }).eq("id", match.id);
      await sb.from("users").update({ status: "dating" }).in("id", [match.user_a, match.user_b]);
      await sb.from("meetings").insert({
        id: genId(),
        match_id: match.id,
        status: "active",
        started_at: nowMs(),
      });
      // R13: dating 진입 시 다른 pending 전부 expired
      const { data: others } = await sb
        .from("matches")
        .select("id, user_a, user_b")
        .eq("state", "pending")
        .neq("id", match.id)
        .or(`user_a.in.(${match.user_a},${match.user_b}),user_b.in.(${match.user_a},${match.user_b})`);
      for (const o of others ?? []) {
        await sb.from("matches").update({ state: "expired", closed_at: nowMs() }).eq("id", o.id);
        await releaseUsers(o.user_a, o.user_b);
      }
      // R15: 쌍방 초대자 포인트
      for (const uid of [match.user_a, match.user_b]) {
        const u = await getUserById(uid);
        if (u?.invited_by)
          await sb.from("point_events").insert({
            id: genId(),
            user_id: u.invited_by,
            type: "match_success",
            points: POINTS.match_success,
            related_match_id: match.id,
            created_at: nowMs(),
          });
      }
      // 쌍방 수락 알림(이메일) — 실패해도 응답엔 영향 없음(best-effort)
      const subj = "매칭이 성사됐어요 · Connecting";
      const bodyHtml = `<p>축하해요! 상대도 수락해 <strong>연락처가 공개</strong>됐어요.</p>
        <p>앱에서 매칭함을 열어 연락처를 확인하고 인사를 건네보세요.</p>`;
      await Promise.all([
        notifyUser(match.user_a, subj, "매칭 성사 🎉", bodyHtml).catch(() => {}),
        notifyUser(match.user_b, subj, "매칭 성사 🎉", bodyHtml).catch(() => {}),
        pushToUsers([match.user_a, match.user_b], {
          title: "매칭이 성사됐어요 🎉",
          body: "연락처가 공개됐어요. 매칭함에서 확인하세요.",
          url: "/matches",
        }).catch(() => {}),
      ]);
      return ok({ ok: true, state: "accepted" });
    }
    // 한쪽 수락 → 상대에게 "응답을 기다려요" 알림
    const otherId = isA ? match.user_b : match.user_a;
    await Promise.all([
      notifyUser(
        otherId,
        "새 매칭이 도착했어요 · Connecting",
        "새 매칭 도착 💌",
        `<p>상대가 당신과의 만남을 <strong>수락</strong>했어요. 앱에서 매칭함을 열어 응답해주세요.</p>
       <p>응답 시간이 지나면 매칭이 자동 종료돼요.</p>`
      ).catch(() => {}),
      pushToUsers([otherId], {
        title: "새 매칭이 도착했어요 💌",
        body: "상대가 수락했어요. 매칭함에서 응답해주세요.",
        url: "/matches",
      }).catch(() => {}),
    ]);
    return ok({ ok: true, state: "pending" });
  }

  // reject
  await sb
    .from("matches")
    .update({ [col]: "reject", state: "rejected", closed_at: nowMs() })
    .eq("id", match.id);
  await releaseUsers(match.user_a, match.user_b);
  return ok({ ok: true, state: "rejected" });
}

async function releaseUsers(a: string, b: string) {
  await getSupabase()
    .from("users")
    .update({ status: "active" })
    .eq("status", "match_pending")
    .in("id", [a, b]);
}
