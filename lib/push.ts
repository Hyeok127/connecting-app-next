// lib/push.ts — 웹푸시(브라우저 알림). 스키마 변경 없이 point_events에 저장:
//   VAPID 키:   type='vapid_keys',  related_match_id=JSON({publicKey,privateKey})  (루트 관리자 소유, 전역 1쌍)
//   구독:        type='push_sub',    related_match_id=JSON(PushSubscription)          (사용자·기기별 N개)
// VAPID 키는 최초 사용 시 자동 생성돼 DB에 저장된다(환경변수·외부가입 불필요).
import webpush from "web-push";
import { getSupabase } from "@/lib/supabase";
import { genId, nowMs } from "@/lib/utils";

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface Vapid {
  publicKey: string;
  privateKey: string;
}

// VAPID subject(푸시 서비스 운영자용 연락처) — 형식만 유효하면 됨.
const VAPID_SUBJECT = "mailto:noreply@connecting.app";

// VAPID 키 소유자(삭제되지 않는 안정적 계정) = 최초 루트 관리자.
async function rootOwnerId(): Promise<string | null> {
  const sb = getSupabase();
  const { data: admin } = await sb
    .from("users")
    .select("id")
    .eq("is_admin", 1)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (admin?.id) return admin.id;
  // 폴백: 가장 먼저 가입한 사용자
  const { data: any } = await sb.from("users").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return any?.id ?? null;
}

let cachedVapid: Vapid | null = null;

// 전역 VAPID 키 조회(없으면 생성·저장). 항상 '가장 먼저 만들어진' 행을 읽어 공개/개인 키가 한 쌍으로 일치.
export async function getVapid(): Promise<Vapid | null> {
  if (cachedVapid) return cachedVapid;
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("point_events")
    .select("related_match_id")
    .eq("type", "vapid_keys")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing?.related_match_id) {
    try {
      cachedVapid = JSON.parse(existing.related_match_id) as Vapid;
      return cachedVapid;
    } catch {
      /* 손상 시 재생성 */
    }
  }
  const owner = await rootOwnerId();
  if (!owner) return null; // 사용자가 아무도 없으면 보류
  const keys = webpush.generateVAPIDKeys();
  const vapid: Vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  await sb.from("point_events").insert({
    id: genId(),
    user_id: owner,
    type: "vapid_keys",
    points: 0,
    related_match_id: JSON.stringify(vapid),
    created_at: nowMs(),
  });
  // 경쟁 상황 대비: 방금 넣은 것 말고 '가장 이른' 행을 다시 읽어 확정.
  const { data: canon } = await sb
    .from("point_events")
    .select("related_match_id")
    .eq("type", "vapid_keys")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  try {
    cachedVapid = JSON.parse(canon!.related_match_id!) as Vapid;
  } catch {
    cachedVapid = vapid;
  }
  return cachedVapid;
}

// 클라이언트 구독용 공개키만.
export async function getPublicKey(): Promise<string | null> {
  return (await getVapid())?.publicKey ?? null;
}

// 구독 저장(같은 endpoint는 교체해 중복 방지).
export async function saveSubscription(userId: string, sub: PushSub): Promise<void> {
  const sb = getSupabase();
  const { data: rows } = await sb
    .from("point_events")
    .select("id, related_match_id")
    .eq("user_id", userId)
    .eq("type", "push_sub");
  for (const r of rows ?? []) {
    try {
      const s = JSON.parse(r.related_match_id) as PushSub;
      if (s.endpoint === sub.endpoint) await sb.from("point_events").delete().eq("id", r.id);
    } catch {
      /* 무시 */
    }
  }
  await sb.from("point_events").insert({
    id: genId(),
    user_id: userId,
    type: "push_sub",
    points: 0,
    related_match_id: JSON.stringify(sub),
    created_at: nowMs(),
  });
}

// endpoint로 구독 해제.
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const sb = getSupabase();
  const { data: rows } = await sb
    .from("point_events")
    .select("id, related_match_id")
    .eq("user_id", userId)
    .eq("type", "push_sub");
  for (const r of rows ?? []) {
    try {
      const s = JSON.parse(r.related_match_id) as PushSub;
      if (s.endpoint === endpoint) await sb.from("point_events").delete().eq("id", r.id);
    } catch {
      /* 무시 */
    }
  }
}

interface SubRow {
  id: string;
  user_id: string;
  sub: PushSub;
}

async function subsFor(userIds: string[]): Promise<SubRow[]> {
  if (!userIds.length) return [];
  const { data } = await getSupabase()
    .from("point_events")
    .select("id, user_id, related_match_id")
    .in("user_id", userIds)
    .eq("type", "push_sub");
  const out: SubRow[] = [];
  for (const r of data ?? []) {
    try {
      out.push({ id: r.id, user_id: r.user_id, sub: JSON.parse(r.related_match_id) as PushSub });
    } catch {
      /* 손상 구독 무시 */
    }
  }
  return out;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// 여러 사용자에게 푸시 발송(best-effort). 만료(404/410) 구독은 정리.
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const vapid = await getVapid();
  if (!vapid) return;
  const rows = await subsFor(userIds);
  if (!rows.length) return;
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify(payload);
  const sb = getSupabase();
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(r.sub, body);
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          try {
            await sb.from("point_events").delete().eq("id", r.id);
          } catch {
            /* 정리 실패 무시 */
          }
        }
      }
    })
  );
}

// 이번 사이클 pending 매칭 당사자 전원에게 '새 매칭' 푸시.
export async function pushMatchesForCycle(cycle: string): Promise<void> {
  const { data: rows } = await getSupabase()
    .from("matches")
    .select("user_a, user_b")
    .eq("cycle_date", cycle)
    .eq("state", "pending");
  const matches = (rows as { user_a: string; user_b: string }[] | null) ?? [];
  if (!matches.length) return;
  const ids = [...new Set(matches.flatMap((m) => [m.user_a, m.user_b]))];
  await pushToUsers(ids, {
    title: "새 매칭이 도착했어요 💌",
    body: "매칭함에서 수락 여부를 정해주세요.",
    url: "/matches",
  });
}
