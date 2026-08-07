// lib/auth.ts — 세션 생성/검증 (Postgres 기반, 서버리스 안전)
import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { SESSION_TTL_MS, LOGIN_FAIL_MAX, LOGIN_LOCK_MS } from "@/lib/constants";
import { genId, nowMs } from "@/lib/utils";
import type { UserRow } from "@/lib/types";

export async function createSession(userId: string): Promise<string> {
  const token = genId() + genId(); // 32 hex
  await getSupabase()
    .from("sessions")
    .insert({ token, user_id: userId, created_at: nowMs() });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await getSupabase().from("sessions").delete().eq("token", token);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { data } = await getSupabase()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as UserRow) ?? null;
}

export function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function authFromToken(token?: string | null): Promise<UserRow | null> {
  if (!token) return null;
  const sb = getSupabase();
  const { data: sess } = await sb
    .from("sessions")
    .select("user_id, created_at")
    .eq("token", token)
    .maybeSingle();
  if (!sess) return null;
  if (nowMs() - sess.created_at > SESSION_TTL_MS) {
    await sb.from("sessions").delete().eq("token", token);
    return null;
  }
  const { data: user } = await sb
    .from("users")
    .select("*")
    .eq("id", sess.user_id)
    .maybeSingle();
  return (user as UserRow) ?? null;
}

// ---- 로그인 실패 잠금 (DB) ----
export async function lockedUntil(name: string): Promise<number> {
  const { data } = await getSupabase()
    .from("login_attempts")
    .select("until")
    .eq("name_lower", name.toLowerCase())
    .maybeSingle();
  return data && data.until > nowMs() ? data.until : 0;
}

export async function registerLoginFail(name: string): Promise<void> {
  const key = name.toLowerCase();
  const sb = getSupabase();
  const { data } = await sb
    .from("login_attempts")
    .select("count, until")
    .eq("name_lower", key)
    .maybeSingle();
  if (data && data.until > nowMs()) return; // 이미 잠금
  const count = (data?.count ?? 0) + 1;
  const until = count >= LOGIN_FAIL_MAX ? nowMs() + LOGIN_LOCK_MS : 0;
  await sb
    .from("login_attempts")
    .upsert({ name_lower: key, count: count >= LOGIN_FAIL_MAX ? 0 : count, until }, { onConflict: "name_lower" });
}

export async function registerLoginSuccess(name: string): Promise<void> {
  await getSupabase()
    .from("login_attempts")
    .delete()
    .eq("name_lower", name.toLowerCase());
}
