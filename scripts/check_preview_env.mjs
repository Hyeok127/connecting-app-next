// scripts/check_preview_env.mjs — P0-3: Preview가 어느 DB를 보는지 확인.
//
// 왜: Preview 환경변수의 Supabase URL이 Production과 같으면 dev 브랜치 테스트가
//     전부 실사용자 데이터를 건드린다. STATUS.md의 "아직 안 한 일 > C. 인프라" 1번.
//
// 실행: .env.local에 VERCEL_TOKEN이 있는 기기(nt9)에서
//   node scripts/check_preview_env.mjs
//
// 이 스크립트는 읽기만 한다. 값은 마스킹해 출력하며 시크릿을 그대로 찍지 않는다.

import fs from "node:fs";

const envFile = process.argv[2] || ".env.local";
if (!fs.existsSync(envFile)) {
  console.error(`${envFile} 없음. VERCEL_TOKEN이 있는 기기에서 실행하세요 (nt9).`);
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const TOKEN = env.VERCEL_TOKEN;
if (!TOKEN) { console.error("VERCEL_TOKEN 필요"); process.exit(1); }

const PROJECT = process.env.VERCEL_PROJECT || "connecting-app-next";
const API = "https://api.vercel.com";

async function get(path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

// 값 자체는 찍지 않는다. Supabase URL은 프로젝트 ref만 뽑아 비교한다.
const refOf = (v) => {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(v || "");
  return m ? m[1] : null;
};
const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-4)} (len ${v.length})` : "(없음)");

const WATCH = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "R2_BUCKET",
];

const { envs } = await get(`/v10/projects/${PROJECT}/env?decrypt=true`);

// target별로 정리
const byKey = new Map();
for (const e of envs) {
  if (!WATCH.includes(e.key)) continue;
  if (!byKey.has(e.key)) byKey.set(e.key, {});
  for (const t of e.target || []) byKey.get(e.key)[t] = e.value;
}

console.log(`프로젝트: ${PROJECT}\n`);
let verdict = null;
for (const key of WATCH) {
  const t = byKey.get(key) || {};
  console.log(`■ ${key}`);
  for (const target of ["production", "preview", "development"]) {
    const v = t[target];
    const extra = key === "NEXT_PUBLIC_SUPABASE_URL" && v ? `  ref=${refOf(v)}` : "";
    console.log(`   ${target.padEnd(12)} ${v ? mask(v) : "(미설정)"}${extra}`);
  }
  if (key === "NEXT_PUBLIC_SUPABASE_URL") {
    const p = refOf(t.production);
    const v = refOf(t.preview);
    if (!p || !v) verdict = "unknown";
    else verdict = p === v ? "SAME" : "DIFFERENT";
  }
  console.log("");
}

console.log("─".repeat(60));
if (verdict === "SAME") {
  console.log("🚨 위험: Preview와 Production이 같은 Supabase 프로젝트를 본다.");
  console.log("   dev 브랜치 배포에서의 모든 테스트가 실사용자 데이터를 건드린다.");
  console.log("   조치: Preview target의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를");
  console.log("        개발 프로젝트(vnwkxkopnpyhabjfclpb) 값으로 교체할 것.");
  process.exitCode = 2;
} else if (verdict === "DIFFERENT") {
  console.log("✅ 정상: Preview와 Production이 서로 다른 Supabase 프로젝트를 본다.");
} else {
  console.log("❓ 판정 불가: 한쪽 URL이 비어 있다. 위 출력을 직접 확인할 것.");
  process.exitCode = 3;
}
