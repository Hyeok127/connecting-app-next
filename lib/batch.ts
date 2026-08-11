// lib/batch.ts — 배치 매칭 실행 (Supabase RPC로 원자 실행)
import { getSupabase } from "@/lib/supabase";

// 004_hardening.sql의 잠금 버전을 우선 사용(크론과 수동 배치 동시 실행 방지).
// 아직 SQL 미적용이면 기존 함수로 폴백한다.
export async function runBatch(): Promise<string> {
  const sb = getSupabase();
  const locked = await sb.rpc("run_batch_matching_locked");
  if (!locked.error) return String(locked.data);
  const { data, error } = await sb.rpc("run_batch_matching");
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
