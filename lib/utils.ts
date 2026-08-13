// lib/utils.ts — 공통 유틸 (서버/클라이언트 공용)
import crypto from "crypto";
import { CODE_CHARS } from "@/lib/constants";

export const nowMs = () => Date.now();

export const genId = () => crypto.randomBytes(8).toString("hex");

// KST 기준 사이클 날짜 'YYYY-MM-DD' (R18)
// 개발 전용 테스트 훅: CYCLE_OVERRIDE(YYYY-MM-DD)가 설정되면 그 날짜를 "오늘"로 취급한다.
// → 3일 시나리오처럼 여러 날을 하루에 시뮬레이션할 때 사용. 운영엔 이 env가 없어 무영향.
export const cycleDate = (offsetDays = 0) => {
  const ov = process.env.CYCLE_OVERRIDE;
  if (ov && /^\d{4}-\d{2}-\d{2}$/.test(ov)) {
    return new Date(new Date(ov + "T00:00:00Z").getTime() + offsetDays * 86400e3).toISOString().slice(0, 10);
  }
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
};

export function parseArr(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  try {
    const a = JSON.parse(String(v));
    return Array.isArray(a) ? a.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return String(v)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export async function genInviteCode(
  isTaken: (code: string) => Promise<boolean>
): Promise<string> {
  for (;;) {
    let c = "";
    for (let i = 0; i < 8; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!(await isTaken(c))) return c;
  }
}

// 저장소에 올린 사진 object path 검증 (서버가 발급한 형식만 허용)
export const PHOTO_PATH_RE =
  /^[0-9a-f]+\/[0-9]{13}-[0-9a-f]+\.(jpg|jpeg|png|webp|gif)$/i;

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
