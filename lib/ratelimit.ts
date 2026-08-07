// lib/ratelimit.ts — IP 단위 속도 제한 (DB 기반, 서버리스 안전)
import { getSupabase } from "@/lib/supabase";
import { nowMs } from "@/lib/utils";
import { RATE_WINDOW_MS } from "@/lib/constants";

export async function ipAllowed(
  scope: string,
  key: string,
  max: number,
  windowMs = RATE_WINDOW_MS
): Promise<boolean> {
  const now = nowMs();
  const sb = getSupabase();
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
