import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (!user.is_admin) return forbidden("관리자만 사용할 수 있습니다."); // R25

  const sb = getSupabase();
  const { data: users } = await sb.from("users").select("*").order("created_at", { ascending: true });
  const { data: sums } = await sb.from("point_events").select("user_id, points");

  const totals = new Map<string, number>();
  for (const s of sums ?? []) totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + (s.points || 0));
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));

  const list = (users ?? []).map((u) => ({
    id: u.id,
    role: u.role,
    name: u.name,
    gender: u.gender,
    age: u.age,
    job: u.job,
    region: u.region,
    status: u.status,
    trust_score: u.trust_score,
    invite_code: u.invite_code,
    is_admin: !!u.is_admin,
    created_at: u.created_at,
    inviter_name: u.invited_by ? names.get(u.invited_by) ?? null : null,
    points: totals.get(u.id) ?? 0,
  }));

  return ok({ users: list });
}
