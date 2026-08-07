import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";
import { createSession, lockedUntil, registerLoginFail, registerLoginSuccess } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { clientIp, ipAllowed } from "@/lib/ratelimit";
import { LOGIN_IP_MAX } from "@/lib/constants";
import { publicUserWithPhotos } from "@/lib/serialize";
import type { UserRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await ipAllowed("login", ip, LOGIN_IP_MAX)))
    return fail("로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.", 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }
  const uname = String(body.name ?? "").trim();
  const pin = body.pin;

  const until = await lockedUntil(uname);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    return fail(`로그인 실패가 반복돼 잠금 처리됐습니다. ${mins}분 후 다시 시도해주세요.`, 429);
  }

  const sb = getSupabase();
  const { data: u } = await sb.from("users").select("*").ilike("name", uname).maybeSingle();
  if (!u || !bcrypt.compareSync(String(pin ?? ""), (u as UserRow).pin_hash)) {
    await registerLoginFail(uname);
    return fail("이름 또는 PIN이 올바르지 않습니다.", 401);
  }
  await registerLoginSuccess(uname);
  const token = await createSession((u as UserRow).id);
  const me = await publicUserWithPhotos(u as UserRow);
  (me as unknown as Record<string, unknown>).contact = (u as UserRow).contact;
  return ok({ token, user: me });
}
