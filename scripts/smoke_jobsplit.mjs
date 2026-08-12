// 직장유형/직무 분리 + 필터 검증.
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const CODE = process.env.INVITE_CODE;
if (!CODE) throw new Error("INVITE_CODE 필요");
const rnd = Math.random().toString(36).slice(2, 7);
let fail = 0;
const ck = (n, c, x = "") => { console.log(`${c ? "  ok " : "FAIL "} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
async function signup(sfx, gender, extra) {
  const r = await api("/auth/signup", { method: "POST", body: { code: CODE, role: "member", name: `js_${rnd}_${sfx}`, pin: "123456", agree: true, gender, age: 30, keywords: ["영화"], ...extra } });
  if (r.status !== 200) throw new Error(`가입 실패(${sfx}): ` + r.text.slice(0, 200));
  return r.json;
}

console.log("1) 내 직장유형/직무가 각각 저장되는지");
const a = await signup("a", "남성", { job_type: "스타트업", job_role: "개발·엔지니어링" });
ck("직장유형 저장", a.user.jobType === "스타트업", a.user.jobType);
ck("직무 저장", a.user.jobRole === "개발·엔지니어링", a.user.jobRole);

console.log("\n2) 직장유형 필터: B는 '대기업'만 원함 → A(스타트업) 제외");
const b = await signup("b", "여성", { pref_genders: ["남성"], pref_job_types: ["대기업"] });
const recB = await api("/recommendations", { token: b.token });
ck("A 제외됨", !(recB.json?.candidates ?? []).some((c) => c.id === a.user.id));

console.log("\n3) 직무 필터: C는 '개발·엔지니어링' 원함, 직장유형 무관 → A 포함");
const c = await signup("c", "여성", { pref_genders: ["남성"], pref_job_roles: ["개발·엔지니어링"] });
const recC = await api("/recommendations", { token: c.token });
ck("A 노출됨", (recC.json?.candidates ?? []).some((x) => x.id === a.user.id), `${recC.json?.candidates?.length}명`);

console.log("\n4) 직무 불일치: D는 '디자인' 원함 → A(개발) 제외");
const d = await signup("d", "여성", { pref_genders: ["남성"], pref_job_roles: ["디자인"] });
const recD = await api("/recommendations", { token: d.token });
ck("A 제외됨", !(recD.json?.candidates ?? []).some((x) => x.id === a.user.id));

console.log("\n5) 프로필 수정으로 직장유형 변경 → 반영");
const put = await api("/me", { method: "PUT", token: a.token, body: { job_type: "대기업", job_role: "개발·엔지니어링" } });
ck("직장유형 변경", put.json?.user?.jobType === "대기업", put.json?.user?.jobType);
const recB2 = await api("/recommendations", { token: b.token });
ck("이제 B(대기업 선호)에 A 노출", (recB2.json?.candidates ?? []).some((x) => x.id === a.user.id));

for (const u of [a, b, c, d]) await api("/me", { method: "DELETE", token: u.token });
console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`}`);
process.exit(fail === 0 ? 0 : 1);
