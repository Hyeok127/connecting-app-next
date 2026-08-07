// lib/api.ts — 클라이언트 API 헬퍼
"use client";

export class ApiError extends Error {}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body && !(opts.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...opts, headers });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok)
    throw new ApiError((data as { error?: string })?.error || "요청에 실패했습니다.");
  return data as T;
}
