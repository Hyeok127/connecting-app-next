// lib/push.ts — 웹푸시(브라우저 알림).
//   VAPID 키: app_config('vapid_keys')에 전역 1쌍. 최초 사용 시 자동 생성돼 저장된다
//             (환경변수·외부 가입 불필요).
//   구독:      push_subscriptions 테이블에 사용자·기기별 N개(endpoint 유니크).
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

let cachedVapid: Vapid | null = null;

// 전역 VAPID 키 조회(없으면 생성·저장). app_config의 PK(key)가 유니크라
// 동시 생성이 일어나도 먼저 들어간 한 쌍만 남고, 이후 재조회로 그 값을 쓴다.
export async function getVapid(): Promise<Vapid | null> {
  if (cachedVapid) return cachedVapid;
  const sb = getSupabase();
  const read = async (): Promise<Vapid | null> => {
    const { data } = await sb.from("app_config").select("value").eq("key", "vapid_keys").maybeSingle();
    const v = data?.value as Vapid | undefined;
    return v?.publicKey && v?.privateKey ? v : null;
  };

  const existing = await read();
  if (existing) {
    cachedVapid = existing;
    return cachedVapid;
  }

  const keys = webpush.generateVAPIDKeys();
  const { error } = await sb.from("app_config").insert({
    key: "vapid_keys",
    value: { publicKey: keys.publicKey, privateKey: keys.privateKey },
    updated_at: nowMs(),
  });
  if (error && error.code !== "23505") return null; // 23505 = 다른 요청이 먼저 생성
  cachedVapid = await read();
  return cachedVapid;
}

// 클라이언트 구독용 공개키만.
export async function getPublicKey(): Promise<string | null> {
  return (await getVapid())?.publicKey ?? null;
}

// 구독 저장. endpoint가 유니크라 같은 기기는 자동으로 한 행만 유지된다(소유자 갱신).
export async function saveSubscription(userId: string, sub: PushSub): Promise<void> {
  await getSupabase().from("push_subscriptions").upsert(
    {
      id: genId(),
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      created_at: nowMs(),
    },
    { onConflict: "endpoint" }
  );
}

// endpoint로 구독 해제.
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await getSupabase().from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
}

interface SubRow {
  id: string;
  user_id: string;
  sub: PushSub;
}

async function subsFor(userIds: string[]): Promise<SubRow[]> {
  if (!userIds.length) return [];
  const { data } = await getSupabase()
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  return (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    sub: { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
  }));
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
            await sb.from("push_subscriptions").delete().eq("id", r.id); // 만료된 구독 정리
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
