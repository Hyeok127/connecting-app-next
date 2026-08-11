// 004_hardening.sql 적용 결과 검증(읽기 전용).
// RLS는 anon 키로 users를 읽어보면 확인된다(차단되면 성공).
// 사용: node scripts/verify_004.mjs <env파일>  [anon키]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = process.argv[2] || ".env.local";
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
console.log("대상:", url.replace(/https:\/\/([^.]+).*/, "$1"));

// 1) rate limit RPC
const rl = await sb.rpc("bump_rate_limit", {
  p_scope: "verify",
  p_key: "check",
  p_now: Date.now(),
  p_window_ms: 60000,
});
console.log("bump_rate_limit:", rl.error ? `없음 (${rl.error.message})` : `있음 (count=${rl.data})`);

// 2) 배치 잠금 함수 — 실제로 호출해야 확인된다(인자 없는 함수라 프로브가 불가능).
//    ⚠ 호출하면 매칭이 생성되므로 --run-batch 를 준 경우에만 실행한다(dev 전용).
if (process.argv.includes("--run-batch")) {
  const r = await sb.rpc("run_batch_matching_locked");
  console.log("run_batch_matching_locked 실행:", r.error ? `실패 (${r.error.message})` : `성공 → ${r.data}`);
} else {
  console.log("run_batch_matching_locked: 실행 생략 (--run-batch 로 확인 가능)");
}

// 3) RLS — anon 키가 있으면 차단 여부 확인
const anon = process.argv[3];
if (anon) {
  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const r = await pub.from("users").select("id").limit(1);
  console.log("anon으로 users 조회:", r.error ? `차단됨 ✓ (${r.error.message})` : `읽힘 ✗ (${r.data.length}행) — RLS 미적용`);
} else {
  console.log("anon 키 미제공 — RLS는 Supabase 대시보드 Table Editor에서 확인하세요.");
}
