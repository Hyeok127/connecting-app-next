// lib/batch.ts — 배치 매칭 실행 (Supabase RPC로 원자 실행)
import { getSupabase } from "@/lib/supabase";

// 잠금 버전을 우선 사용(크론과 수동 배치 동시 실행 방지).
// cycle을 넘기면 그 날짜로 배치(테스트 override 반영). 미적용 환경이면 폴백.
export async function runBatch(cycle?: string): Promise<string> {
  const sb = getSupabase();
  const args = cycle ? { p_cycle: cycle } : {};
  const locked = await sb.rpc("run_batch_matching_locked", args);
  if (!locked.error) return String(locked.data);
  const { data, error } = await sb.rpc("run_batch_matching", args);
  if (error) throw new Error(error.message);
  return String(data);
}

export async function expireOverdue(): Promise<void> {
  const sb = getSupabase();
  const now = Date.now();
  const { data: rows } = await sb
    .from("matches")
    .select("id, user_a, user_b")
    .eq("state", "pending")
    .lt("respond_deadline", now);
  if (!rows || rows.length === 0) return;
  await sb
    .from("matches")
    .update({ state: "expired", closed_at: now })
    .eq("state", "pending")
    .lt("respond_deadline", now);
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.user_a);
    ids.add(r.user_b);
  }
  await sb
    .from("users")
    .update({ status: "active" })
    .eq("status", "match_pending")
    .in("id", [...ids]);
}
