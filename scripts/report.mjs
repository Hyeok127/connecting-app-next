// 시나리오 상태 리포트. node scripts/report.mjs [-p]
import fs from "node:fs";
const prod = process.argv.includes("-p");
const envFile = prod ? ".env.local.prod.bak" : ".env.local";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const token = env.SUPABASE_ACCESS_TOKEN;
const url = fs.readFileSync(envFile, "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)[1].trim();
const ref = url.replace(/^https:\/\/([^.]+)\..*$/, "$1");

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error("SQL 실패:", t.slice(0, 200)); return []; }
  return JSON.parse(t);
}

console.log(`\n########## 시나리오 상태 (${ref}) ##########`);

console.log("\n── 회원 ──");
console.table(await q(`select name, gender, age, coalesce(job_type,'') || ' ' || coalesce(job_role,'') as job, region, status,
  case when photos is not null and photos <> '[]' then '있음' else '' end as photo,
  case when contact is not null then '공개' else '' end as contact,
  case when email is not null then '설정' else '' end as email
  from users where coalesce(is_admin,0)<>1 order by created_at`));

console.log("\n── 순위(오늘 확정) ──");
console.table(await q(`select u.name as 주체, t.name as 순위대상, r.rank, r.cycle_date
  from rankings r join users u on u.id=r.user_id join users t on t.id=r.target_id
  order by r.cycle_date desc, u.name, r.rank`));

console.log("\n── 매칭 ──");
console.table(await q(`select a.name as A, b.name as B, m.state, m.a_response as A응답, m.b_response as B응답, m.cycle_date,
  (select status from meetings mt where mt.match_id=m.id) as 만남
  from matches m join users a on a.id=m.user_a join users b on b.id=m.user_b order by m.created_at`));

console.log("\n── 사진 교환 동의(매칭별 동의자 수) ──");
console.table(await q(`select a.name || ' × ' || b.name as 매칭, count(pc.user_id) as 동의자수,
  case when count(pc.user_id)>=2 then '교환됨' else '대기' end as 상태
  from matches m join users a on a.id=m.user_a join users b on b.id=m.user_b
  left join photo_consents pc on pc.match_id=m.id
  group by a.name, b.name, m.id order by m.created_at`));

console.log("\n── 만남/피드백 ──");
console.table(await q(`select a.name || ' × ' || b.name as 매칭, mt.status as 만남상태,
  (select count(*) from feedbacks f where f.meeting_id=mt.id) as 피드백수
  from meetings mt join matches m on m.id=mt.match_id
  join users a on a.id=m.user_a join users b on b.id=m.user_b order by mt.started_at`));
