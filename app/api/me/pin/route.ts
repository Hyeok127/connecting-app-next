import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, fail, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

// PIN 변경: 현재 PIN 확인 후 새 PIN(숫자 6자리)으로 교체.
export async function POST(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const cur = String(body.current_pin ?? "");
  const next = String(body.new_pin ?? "");
  if (!bcrypt.compareSync(cur, user.pin_hash)) return fail("현재 PIN이 올바르지 않습니다.", 400);
  if (!/^\d{6}$/.test(next)) return fail("새 PIN은 숫자 6자리여야 합니다.", 400);
  if (cur === next) return fail("기존과 다른 PIN을 입력해주세요.", 400);

  const { error } = await getSupabase()
    .from("users")
    .update({ pin_hash: bcrypt.hashSync(next, 10) })
    .eq("id", user.id);
  if (error) return fail(error.message, 400);
  return ok({ ok: true });
}
