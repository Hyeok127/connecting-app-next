import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";
import { parseArr, PHOTO_PATH_RE } from "@/lib/utils";
import { PHOTO_BUCKET } from "@/lib/constants";
import { parseJsonArray, publicUserWithPhotos } from "@/lib/serialize";
import { cleanKeywords } from "@/lib/keywords";
import { cleanValues } from "@/lib/values";
import { JOB_TYPES, JOB_ROLES } from "@/lib/profileOptions";

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
    // 연락처는 여기서 받지 않는다 — 매칭 수락 시에만 설정(사진 교환과 동일 원칙).
    if (body.region !== undefined) sets.region = String(body.region).trim() || null;
    if (body.job_type !== undefined)
      sets.job_type = JOB_TYPES.includes(String(body.job_type) as never) ? String(body.job_type) : null;
    if (body.job_role !== undefined)
      sets.job_role = JOB_ROLES.includes(String(body.job_role) as never) ? String(body.job_role) : null;
    // 가치관 설문 — users.life_values(jsonb)
    if (body.values !== undefined) {
      const vals = cleanValues(body.values);
      sets.life_values = Object.keys(vals).length ? vals : null;
    }
    if (body.keywords !== undefined) {
      const kw = cleanKeywords(parseArr(body.keywords));
      if (kw.length < 1) return fail("나를 나타내는 키워드를 1개 이상 골라주세요.", 400);
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

// 회원 탈퇴: 진행 중 매칭(dating)이면 막고, 아니면 본인 데이터 전부 삭제.
export async function DELETE(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  const sb = getSupabase();
  if (user.status === "dating")
    return fail("진행 중인 만남이 있어 탈퇴할 수 없어요. 만남을 종료한 뒤 다시 시도해주세요.", 409);

  const id = user.id;
  // 내 사진 정리
  const myPhotos = parseJsonArray(user.photos);
  if (myPhotos.length) await sb.storage.from(PHOTO_BUCKET).remove(myPhotos).catch(() => {});

  // 나와 관련된 매칭/만남/피드백 정리(FK 안전 순서)
  const { data: myMatches } = await sb
    .from("matches")
    .select("id, user_a, user_b, state")
    .or(`user_a.eq.${id},user_b.eq.${id}`);
  const matchIds = (myMatches ?? []).map((m) => m.id);

  // ⚠ 매칭 행을 지우면 만료 배치가 상대를 찾지 못해, 상대가 match_pending/dating에
  //   영구히 갇힌다(추천에서 조용히 사라짐). 삭제 전에 상대를 active로 돌려놓는다.
  const counterparts = (myMatches ?? [])
    .filter((m) => m.state === "pending" || m.state === "accepted")
    .map((m) => (m.user_a === id ? m.user_b : m.user_a))
    .filter((uid) => uid !== id);
  if (counterparts.length) {
    await sb
      .from("users")
      .update({ status: "active" })
      .in("id", [...new Set(counterparts)])
      .in("status", ["match_pending", "dating"]);
  }

  if (matchIds.length) {
    const { data: mtgs } = await sb.from("meetings").select("id").in("match_id", matchIds);
    const meetingIds = (mtgs ?? []).map((x) => x.id);
    if (meetingIds.length) await sb.from("feedbacks").delete().in("meeting_id", meetingIds);
    await sb.from("meetings").delete().in("match_id", matchIds);
    await sb.from("matches").delete().in("id", matchIds);
  }
  await sb.from("feedbacks").delete().eq("from_user", id);
  await sb.from("point_events").delete().eq("user_id", id);
  await sb.from("sessions").delete().eq("user_id", id);
  await sb.from("preferences").delete().eq("user_id", id);
  await sb.from("rankings").delete().or(`user_id.eq.${id},target_id.eq.${id}`);
  // blocks/reports/photo_consents/push_subscriptions는 users FK가 on delete cascade라
  // 아래 users 삭제로 함께 지워진다(양방향 모두).
  await sb.from("users").update({ invited_by: null }).eq("invited_by", id); // 나를 초대한 참조 해제
  const { error } = await sb.from("users").delete().eq("id", id);
  if (error) return fail(error.message, 400);
  return ok({ ok: true });
}
