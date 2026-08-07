import type { NextRequest } from "next/server";
import { deleteSession } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return unauthorized();
  await deleteSession(token);
  return ok({ ok: true });
}
