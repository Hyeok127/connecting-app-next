// lib/ratelimit.ts — IP 단위 속도 제한 (DB 기반, 서버리스 안전)
import { getSupabase } from "@/lib/supabase";
import { nowMs } from "@/lib/utils";
import { RATE_WINDOW_MS } from "@/lib/constants";

// ⚠ 조회 후 증가(read-modify-write) 방식은 동시 요청에서 전부 통과한다.
//   004_hardening.sql의 `bump_rate_limit` RPC가 있으면 원자적 증가를 쓰고,
//   아직 적용 전이면 기존 방식으로 폴백한다(적용 후 자동으로 안전해짐).
let rpcAvailable: boolean | null = null;

export async function ipAllowed(
  scope: string,
  key: string,
  max: number,
  windowMs = RATE_WINDOW_MS
): Promise<boolean> {
  const now = nowMs();
  const sb = getSupabase();

  if (rpcAvailable !== false) {
    const { data, error } = await sb.rpc("bump_rate_limit", {
      p_scope: scope,
      p_key: key,
      p_now: now,
      p_window_ms: windowMs,
    });
    if (!error) {
      rpcAvailable = true;
      return Number(data) <= max; // RPC는 이번 요청 포함 카운트를 반환
    }
    rpcAvailable = false; // 함수 미적용 → 폴백
  }

  const { data } = await sb
    .from("ip_attempts")
    .select("count, window_start")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();
  if (!data || data.window_start + windowMs < now) {
    await sb
      .from("ip_attempts")
      .upsert({ scope, key, window_start: now, count: 1 }, { onConflict: "scope,key" });
    return true;
  }
  if (data.count >= max) return false;
  await sb
    .from("ip_attempts")
    .update({ count: data.count + 1 })
    .eq("scope", scope)
    .eq("key", key);
  return true;
}

// Vercel은 신뢰 가능한 X-Forwarded-For를 설정함
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
