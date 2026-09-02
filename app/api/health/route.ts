import { getSupabase } from "@/lib/supabase";
import { ok, fail } from "@/lib/http";
import { cycleDate } from "@/lib/utils";
import { buildMigrationStatus } from "@/lib/migrations";

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

    const [usersRes, todayRes, lastRes, migrationsRes] = await Promise.all([
      sb.from("users").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("matches").select("id", { count: "exact", head: true }).eq("cycle_date", cycle),
      sb.from("matches").select("cycle_date").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // 적용 이력 조회는 여기서 한다 — 판정 로직(lib/migrations)은 DB를 모르는 순수 모듈로 뒀다.
      sb.from("schema_migrations").select("version"),
    ]);

    if (usersRes.error) return fail(`db: ${usersRes.error.message}`, 503);

    const migrations = buildMigrationStatus(
      migrationsRes.error ? null : (migrationsRes.data ?? []).map((r) => String(r.version)),
      migrationsRes.error?.message
    );

    const todayMatches = todayRes.count ?? 0;
    return ok({
      status: "ok",
      cycle,
      active_users: usersRes.count ?? 0,
      matches_today: todayMatches,
      last_match_cycle: lastRes.data?.cycle_date ?? null,
      batch_stale: todayMatches === 0,
      // 저장소에 있으나 DB에 적용되지 않은 마이그레이션 (P6-1).
      // 배포만으로는 스키마가 안 바뀌므로, 여기가 비어 있지 않으면 사람이 손을 대야 한다.
      migrations,
      migrations_pending: migrations.pending.length > 0,
      db_ms: Date.now() - started,
    });
  } catch (e) {
    return fail(`health: ${(e as Error).message}`, 503);
  }
}
