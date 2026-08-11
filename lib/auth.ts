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
  const row = (user as UserRow) ?? null;
  // 정지 계정은 여기서 차단(fail-closed). 개별 라우트에서 빠뜨리면 정지가 무력해진다.
  if (row?.status === "suspended") return null;
  return row;
}

// ---- 로그인 실패 잠금 (DB) ----
// ⚠ 잠금 키는 반드시 정규화된 이름을 쓴다. 사용자가 보낸 원문을 그대로 키로 쓰면
//   `철수` / `철_` / `철%` 처럼 변형해 보내는 것만으로 같은 계정에 대해 카운터가
//   각각 새로 생겨 잠금이 영원히 걸리지 않는다(무차별 대입 우회).
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// PostgREST의 ilike는 `%`, `_`를 와일드카드로 해석하므로 리터럴로 이스케이프한다.
export function escapeLikePattern(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

export async function lockedUntil(name: string): Promise<number> {
  const { data } = await getSupabase()
    .from("login_attempts")
    .select("until")
    .eq("name_lower", normalizeName(name))
    .maybeSingle();
  return data && data.until > nowMs() ? data.until : 0;
}

export async function registerLoginFail(name: string): Promise<void> {
  const key = normalizeName(name);
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
    .eq("name_lower", normalizeName(name));
}

// 특정 사용자의 세션 전부(또는 현재 토큰 제외) 파기. 정지·PIN 변경 시 사용.
export async function revokeSessions(userId: string, keepToken?: string): Promise<void> {
  const q = getSupabase().from("sessions").delete().eq("user_id", userId);
  if (keepToken) await q.neq("token", keepToken);
  else await q;
}
