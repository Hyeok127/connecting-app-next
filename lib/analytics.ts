// lib/analytics.ts — 변화 추이 스냅샷 + 매칭 성사요인 기록.
import { getSupabase } from "@/lib/supabase";
import { genId, nowMs } from "@/lib/utils";
import { keywordSimilarity } from "@/lib/matching";
import { parseValues } from "@/lib/values";
import { parseJsonArray } from "@/lib/serialize";
import { VALUE_DIMENSIONS } from "@/lib/values";
import type { UserRow } from "@/lib/types";

// 현 시점 대시보드 집계를 스냅샷으로 저장(추이 그래프용).
export async function takeSnapshot(cycle: string, label: "auto" | "manual"): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("admin_dashboard", { p_cycle: cycle });
  if (error || !data) return;
  await sb.from("metrics_snapshots").insert({ id: genId(), taken_at: nowMs(), cycle, label, data });
}

const sido = (region: string | null) => (region ? region.split(" ")[0] : null);

// 이번 사이클에 생성된 매칭들의 "요인"을 기록(아직 없는 것만). 성사 여부는 조인으로 도출.
export async function recordMatchFeatures(cycle: string): Promise<void> {
  const sb = getSupabase();
  const { data: matches } = await sb
    .from("matches")
    .select("id, user_a, user_b, score, cycle_date")
    .eq("cycle_date", cycle);
  if (!matches?.length) return;

  const { data: existing } = await sb.from("match_features").select("match_id").eq("cycle_date", cycle);
  const done = new Set((existing ?? []).map((e) => e.match_id));
  const todo = matches.filter((m) => !done.has(m.id));
  if (!todo.length) return;

  const ids = [...new Set(todo.flatMap((m) => [m.user_a, m.user_b]))];
  const { data: urows } = await sb.from("users").select("*").in("id", ids);
  const byId = new Map((urows as UserRow[] ?? []).map((u) => [u.id, u]));

  const rows = todo.map((m) => {
    const a = byId.get(m.user_a);
    const b = byId.get(m.user_b);
    const aKw = a ? parseJsonArray(a.keywords) : [];
    const bKw = b ? parseJsonArray(b.keywords) : [];
    const aVal = a ? parseValues(a.life_values ?? a.workplace) : {};
    const bVal = b ? parseValues(b.life_values ?? b.workplace) : {};
    let valueMatch = 0;
    for (const d of VALUE_DIMENSIONS) if (aVal[d.key] && aVal[d.key] === bVal[d.key]) valueMatch++;
    const sharedKw = aKw.filter((k) => bKw.includes(k)).length;
    return {
      match_id: m.id,
      cycle_date: cycle,
      keyword_sim: Number(keywordSimilarity(aKw, bKw).toFixed(4)),
      shared_kw: sharedKw,
      value_match: valueMatch,
      age_diff: a?.age != null && b?.age != null ? Math.abs(a.age - b.age) : null,
      same_region: a && b ? sido(a.region) != null && sido(a.region) === sido(b.region) : null,
      same_job_type: a && b ? !!a.job_type && a.job_type === b.job_type : null,
      same_job_role: a && b ? !!a.job_role && a.job_role === b.job_role : null,
      score: m.score,
      created_at: nowMs(),
    };
  });
  await sb.from("match_features").upsert(rows, { onConflict: "match_id" });
}
