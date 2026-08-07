import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();

  const sb = getSupabase();
  const { data: invitees } = await sb
    .from("users")
    .select("id, role, name, status, created_at")
    .eq("invited_by", user.id)
    .order("created_at", { ascending: true });

  const ids = (invitees ?? []).map((i) => i.id);
  let matched = 0;
  if (ids.length > 0) {
    const { count } = await sb
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("state", "accepted")
      .or(`user_a.in.(${ids.join(",")}),user_b.in.(${ids.join(",")})`);
    matched = count ?? 0;
  }
  return ok({ invitees, stats: { invited: invitees?.length ?? 0, matched } });
}
