import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken, getUserById } from "@/lib/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/http";
import { cycleDate, parseArr } from "@/lib/utils";
import { MAX_RANK } from "@/lib/constants";
import { recommendationsFor } from "@/lib/matching";
import { publicUser } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4
  if (user.status === "suspended") return forbidden("정지된 계정입니다. 운영자에게 문의해주세요.");

  const sb = getSupabase();
  const { data: latest } = await sb
    .from("rankings")
    .select("cycle_date")
    .eq("user_id", user.id)
    .order("cycle_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return ok({ cycle_date: null, confirmed_today: false, ranking: [] });

  const { data: rows } = await sb
    .from("rankings")
    .select("target_id, rank")
    .eq("user_id", user.id)
    .eq("cycle_date", latest.cycle_date)
    .order("rank", { ascending: true });

  const targets: unknown[] = [];
  for (const r of rows ?? []) {
    const t = await getUserById(r.target_id);
    if (t) targets.push({ rank: r.rank, target: publicUser(t) });
  }
  return ok({
    cycle_date: latest.cycle_date,
    confirmed_today: latest.cycle_date === cycleDate(),
    ranking: targets,
  });
}

export async function PUT(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4
  if (user.status === "suspended") return forbidden("정지된 계정입니다. 운영자에게 문의해주세요.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }

  const today = cycleDate();
  const sb = getSupabase();
  const { data: already } = await sb
    .from("rankings")
    .select("1")
    .eq("user_id", user.id)
    .eq("cycle_date", today)
    .maybeSingle();
  if (already) return fail("오늘의 순위는 이미 확정했습니다.", 409); // R8

  const ids = parseArr(body.target_ids).slice(0, MAX_RANK);
  if (ids.length === 0) return fail("순위를 1명 이상 지정해주세요.", 400);

  const valid = new Set((await recommendationsFor(user.id, user)).map((r) => r.user.id));
  for (const id of ids)
    if (!valid.has(id)) return fail("추천 리스트에 없는 대상이 포함되어 있습니다.", 400);

  const rows = ids.map((target_id, i) => ({
    user_id: user.id,
    cycle_date: today,
    target_id,
    rank: i + 1,
  }));
  const { error } = await sb.from("rankings").insert(rows);
  if (error) return fail(error.message, 400);
  return ok({ ok: true, cycle_date: today });
}
