// Supabase Management API로 임의 SQL 실행(운영 도구).
// 사용:
//   node scripts/sql.mjs "select 1"                 # dev(.env.local)
//   node scripts/sql.mjs -p "select 1"              # prod(.env.local.prod.bak)
//   node scripts/sql.mjs -p -f path/to/file.sql     # 파일 실행
import fs from "node:fs";

const args = process.argv.slice(2);
const prod = args.includes("-p");
const fileIdx = args.indexOf("-f");
const envPath = prod ? ".env.local.prod.bak" : ".env.local";

let sql;
if (fileIdx >= 0) sql = fs.readFileSync(args[fileIdx + 1], "utf8");
else sql = args.filter((a) => a !== "-p").join(" ");
if (!sql?.trim()) {
  console.error('사용법: node scripts/sql.mjs [-p] "SQL"  |  [-p] -f file.sql');
  process.exit(1);
}

const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  (fs.existsSync(".env.local")
    ? (fs.readFileSync(".env.local", "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m) ?? [])[1]
    : null);
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN 필요 (.env.local 또는 환경변수)");

const env = fs.readFileSync(envPath, "utf8");
const url = (env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m) ?? [])[1];
if (!url) throw new Error(`${envPath}에 NEXT_PUBLIC_SUPABASE_URL 없음`);
const ref = url.trim().replace(/^https:\/\/([^.]+)\..*$/, "$1");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`[${ref}] 실패 HTTP ${res.status}:`, text.slice(0, 1500));
  process.exit(1);
}
console.log(`[${ref}]`);
try {
  const json = JSON.parse(text);
  if (Array.isArray(json) && json.length && typeof json[0] === "object") console.table(json);
  else console.log(JSON.stringify(json, null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
