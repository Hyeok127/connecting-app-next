import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { cycleDate } from "@/lib/utils";
import { takeSnapshot } from "@/lib/analytics";

export const runtime = "nodejs";

// 수동 스냅샷(버튼). 현재 집계를 시점 기록으로 저장.
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다.");
  await takeSnapshot(cycleDate(), "manual");
  return ok({ ok: true });
}

// 최근 스냅샷 목록(추이 그래프용). 요약치만 추려서 반환.
export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다.");

  const { data } = await getSupabase()
    .from("metrics_snapshots")
    .select("taken_at, cycle, label, data")
    .order("taken_at", { ascending: true })
    .limit(60);

  const snapshots = (data ?? []).map((s) => {
    const d = s.data as Record<string, Record<string, number>>;
    return {
      taken_at: s.taken_at,
      cycle: s.cycle,
      label: s.label,
      members: d.participants?.members ?? 0,
      total_matches: d.matching?.total_matches ?? 0,
      accepted: d.funnel?.accepted ?? 0,
      couples: d.funnel?.couples ?? 0,
      active_meetings: d.matching?.active_meetings ?? 0,
      pending_pairs: d.today?.pending_batch_pairs ?? 0,
    };
  });
  return ok({ snapshots });
}
