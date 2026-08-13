// Supabase Management API로 마이그레이션(DDL) 적용.
// PostgREST(service_role)로는 DDL이 불가능해서, 대시보드 SQL Editor와 같은 경로인
// Management API를 쓴다. 개인 액세스 토큰(sbp_...)이 필요하다.
//
// 사용:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply_migration.mjs supabase/migrations/004_hardening.sql .env.local.prod.bak
//
// 토큰 발급: https://supabase.com/dashboard/account/tokens  (Generate new token)
import fs from "node:fs";

const [sqlPath, envPath = ".env.local"] = process.argv.slice(2);
if (!sqlPath) {
  console.error("사용법: node scripts/apply_migration.mjs <sql파일> [env파일]");
  process.exit(1);
}

const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (fs.existsSync(".env.local")
    ? (fs.readFileSync(".env.local", "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m) ?? [])[1]?.trim()
    : null);
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN 환경변수가 필요합니다 (sbp_로 시작).");
  console.error("발급: https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

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
if (!url) throw new Error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL이 없습니다.`);
const ref = url.replace(/^https:\/\/([^.]+)\..*$/, "$1");

const sql = fs.readFileSync(sqlPath, "utf8");
console.log(`프로젝트 ${ref} 에 ${sqlPath} 적용 중... (${sql.length}자)`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`실패 (HTTP ${res.status}):`, text.slice(0, 800));
  process.exit(1);
}
console.log("성공:", text.slice(0, 800) || "(응답 본문 없음)");
