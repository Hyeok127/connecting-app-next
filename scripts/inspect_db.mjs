// Management API로 DB 상태를 직접 조회(읽기 전용). 004 적용 결과 확인용.
// 사용: SUPABASE_ACCESS_TOKEN=... node scripts/inspect_db.mjs <env파일>
import fs from "node:fs";

const envPath = process.argv[2] || ".env.local";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN 필요");

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
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace(/^https:\/\/([^.]+)\..*$/, "$1");

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

console.log("대상:", ref);

console.log("\n--- RLS 상태 ---");
console.table(
  await q(`select relname as table, relrowsecurity as rls
           from pg_class where relnamespace = 'public'::regnamespace and relkind='r'
           order by relname`)
);

console.log("\n--- 004가 만든 인덱스 ---");
console.table(
  await q(`select indexname from pg_indexes
           where schemaname='public' and indexname like 'uniq_%' order by indexname`)
);

console.log("\n--- 함수 ---");
console.table(
  await q(`select proname from pg_proc
           where pronamespace='public'::regnamespace
             and proname in ('bump_rate_limit','run_batch_matching_locked','run_batch_matching')
           order by proname`)
);
