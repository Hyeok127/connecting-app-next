// Vercel API로 R2 환경변수 등록. .env.local에서 VERCEL_TOKEN과 R2_* 값을 읽는다.
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const TOKEN = env.VERCEL_TOKEN;
if (!TOKEN) throw new Error("VERCEL_TOKEN 필요");
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const API = "https://api.vercel.com";

async function j(url, opts = {}) {
  const r = await fetch(API + url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch {}
  return { status: r.status, data: d, text: t };
}

// 1) 프로젝트 찾기 (개인 + 모든 팀 범위에서)
const scopes = [{ teamId: null, label: "personal" }];
const teams = await j("/v2/teams");
for (const t of teams.data?.teams ?? []) scopes.push({ teamId: t.id, label: t.slug || t.name });

let found = null;
for (const s of scopes) {
  const q = s.teamId ? `?teamId=${s.teamId}&search=connecting-app-next` : `?search=connecting-app-next`;
  const res = await j(`/v9/projects${q}`);
  const p = (res.data?.projects ?? []).find((x) => x.name === "connecting-app-next");
  if (p) { found = { ...s, projectId: p.id }; break; }
}
if (!found) throw new Error("connecting-app-next 프로젝트를 찾지 못함. 토큰 범위 확인 필요.");
console.log(`프로젝트 발견: ${found.projectId} (scope=${found.label})`);
const teamQ = found.teamId ? `?teamId=${found.teamId}` : "";

// 2) 등록할 값
const vars = [
  ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
  ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
  ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY],
  ["R2_BUCKET", env.R2_BUCKET],
];

// 기존 env 목록(중복 시 갱신)
const existing = await j(`/v9/projects/${found.projectId}/env${teamQ}`);
const byKey = new Map((existing.data?.envs ?? []).map((e) => [e.key, e.id]));

for (const [key, value] of vars) {
  if (!value) { console.log(`  SKIP ${key} (값 없음)`); continue; }
  const body = JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview"] });
  if (byKey.has(key)) {
    // 기존 것 삭제 후 재생성(가장 단순·확실)
    await j(`/v9/projects/${found.projectId}/env/${byKey.get(key)}${teamQ}`, { method: "DELETE" });
  }
  const res = await j(`/v10/projects/${found.projectId}/env${teamQ}`, { method: "POST", body });
  console.log(`  ${res.status < 300 ? "OK  " : "FAIL"} ${key} (${res.status})${res.status >= 300 ? " " + res.text.slice(0, 120) : ""}`);
}
console.log("완료. 재배포해야 적용됩니다.");
