import { getSupabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/http";
import { cycleDate } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

// 상태 점검용(무인증, 개인정보 미노출). 업타임 모니터를 여기에 걸어두면
// DB 장애나 "밤 8시 배치가 안 돈 상황"을 사람이 눈치채기 전에 알 수 있다.
//   batch_stale=true → 오늘 사이클에 매칭이 하나도 생성되지 않음(정상일 수도 있으나 연속되면 이상)
export async function GET() {
  const started = Date.now();
  try {
    const sb = getSupabase();
    const cycle = cycleDate();

    const [usersRes, todayRes, lastRes] = await Promise.all([
      sb.from("users").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("matches").select("id", { count: "exact", head: true }).eq("cycle_date", cycle),
      sb.from("matches").select("cycle_date").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (usersRes.error) return fail(`db: ${usersRes.error.message}`, 503);

    const todayMatches = todayRes.count ?? 0;
    return ok({
      status: "ok",
      cycle,
      active_users: usersRes.count ?? 0,
      matches_today: todayMatches,
      last_match_cycle: lastRes.data?.cycle_date ?? null,
      batch_stale: todayMatches === 0,
      db_ms: Date.now() - started,
    });
  } catch (e) {
    return fail(`health: ${(e as Error).message}`, 503);
  }
}
