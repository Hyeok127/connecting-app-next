// lib/http.ts — NextResponse 헬퍼
import { NextResponse } from "next/server";

export const ok = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, init);

export const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export const notFound = () => fail("찾을 수 없습니다.", 404);
export const unauthorized = () => fail("로그인이 필요합니다.", 401);
export const forbidden = (msg = "권한이 없습니다.") => fail(msg, 403);
