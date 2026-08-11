// lib/meeting.ts — 만남 로직 (R19~R22)
import { getSupabase } from "@/lib/supabase";
import { POINTS, TRUST } from "@/lib/constants";
import { genId, nowMs } from "@/lib/utils";
import type { FeedbackRow, MatchRow, MeetingRow, UserRow } from "@/lib/types";

export async function activeMeetingOf(userId: string): Promise<(MeetingRow & { user_a: string; user_b: string }) | null> {
  const { data } = await getSupabase()
    .from("meetings")
    .select("id, match_id, status, started_at, closed_at, matches!inner(user_a, user_b)")
    .eq("status", "active")
    .or(`matches.user_a.eq.${userId},matches.user_b.eq.${userId}`)
    .maybeSingle();
  if (!data) return null;
  const m = data.matches as unknown as { user_a: string; user_b: string };
  return {
    id: data.id,
    match_id: data.match_id,
    status: data.status,
    started_at: data.started_at,
    closed_at: data.closed_at,
    user_a: m.user_a,
    user_b: m.user_b,
  };
}

export async function getMatchById(id: string): Promise<MatchRow | null> {
  const { data } = await getSupabase()
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as MatchRow) ?? null;
}

// 양쪽 피드백이 모이면 만남 종료 처리. resolved 여부 반환.
export async function resolveMeeting(meetingId: string): Promise<boolean> {
  const sb = getSupabase();
  const { data: fbs } = await sb
    .from("feedbacks")
    .select("*")
    .eq("meeting_id", meetingId);
  // ⚠ 같은 사람이 연타로 두 번 제출하면 행이 2개가 된다. 작성자별로 1건만 남겨야
  //   한 사람의 중복 제출이 "양쪽 응답"으로 오인되지 않는다(노쇼 감점 중복도 방지).
  const byUser = new Map<string, FeedbackRow>();
  for (const f of (fbs as FeedbackRow[]) ?? []) if (!byUser.has(f.from_user)) byUser.set(f.from_user, f);
  const list = [...byUser.values()];
  if (list.length < 2) return false; // R19: 양쪽 선택 필요

  const { data: mt } = await sb
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();
  const meeting = mt as MeetingRow;
  const match = await getMatchById(meeting.match_id);
  if (!match) return false;

  const bothContinue = list.every((f) => f.decision === "continue");
  await sb
    .from("meetings")
    .update({ status: "closed", closed_at: nowMs() })
    .eq("id", meetingId);

  if (bothContinue) {
    // 교제 시작 → paused (R19), 초대자 커플 포인트 (R21)
    await sb.from("users").update({ status: "paused" }).in("id", [match.user_a, match.user_b]);
    for (const uid of [match.user_a, match.user_b]) {
      const u = await getUser(uid);
      if (u?.invited_by)
        await sb.from("point_events").insert({
          id: genId(),
          user_id: u.invited_by,
          type: "couple_success",
          points: POINTS.couple_success,
          related_match_id: match.id,
          created_at: nowMs(),
        });
    }
  } else {
    // 종료 → active 복귀 (R7에 의해 재노출 영구 제외)
    await sb.from("users").update({ status: "active" }).in("id", [match.user_a, match.user_b]);
    let anyNoShow = false;
    for (const f of list) {
      // R20: 노쇼 신고 시 상대 -50
      if (f.no_show) {
        const other = f.from_user === match.user_a ? match.user_b : match.user_a;
        await sb.rpc("add_trust_score", { uid: other, delta: TRUST.no_show });
        anyNoShow = true;
      }
    }
    if (!anyNoShow) {
      await sb.rpc("add_trust_score", { uid: match.user_a, delta: TRUST.clean_close });
      await sb.rpc("add_trust_score", { uid: match.user_b, delta: TRUST.clean_close });
    }
  }
  return true;
}

async function getUser(id: string): Promise<UserRow | null> {
  const { data } = await getSupabase().from("users").select("*").eq("id", id).maybeSingle();
  return (data as UserRow) ?? null;
}
