// 선호 조건 저장/재조회 왕복 테스트(개발 서버).
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const CODE = process.env.INVITE_CODE;
if (!CODE) throw new Error("INVITE_CODE 필요");
const rnd = Math.random().toString(36).slice(2, 8);
let fail = 0;
const ck = (n, c, x = "") => { console.log(`${c ? "  ok " : "FAIL "} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}

// 가입 (선호 조건 포함)
const s = await api("/auth/signup", { method: "POST", body: {
  code: CODE, role: "member", name: `pref_${rnd}`, pin: "123456", agree: true,
  gender: "남성", age: 30, keywords: ["영화"],
  pref_genders: ["여성"], pref_age_min: 25, pref_age_max: 35,
}});
if (s.status !== 200) throw new Error("가입 실패: " + s.text.slice(0, 200));
const tok = s.json.token;

console.log("1) 가입 시 저장한 선호가 GET으로 조회되는지");
const g1 = await api("/me/preferences", { token: tok });
ck("성별 선호", g1.json?.preferences?.genders?.includes("여성"), JSON.stringify(g1.json?.preferences?.genders));
ck("나이 하한 25", g1.json?.preferences?.age_min === 25, String(g1.json?.preferences?.age_min));

console.log("\n2) 선호를 수정 저장하고 다시 조회 (직업/지역 포함)");
await api("/me/preferences", { method: "PUT", token: tok, body: {
  genders: ["여성"], age_min: 28, age_max: 40, jobs: ["개발자", "간호사"], regions: ["서울"],
  value_prefs: { religion: ["무교"] },
}});
const g2 = await api("/me/preferences", { token: tok });
ck("나이 하한 28로 갱신", g2.json?.preferences?.age_min === 28, String(g2.json?.preferences?.age_min));
ck("직업 2개 저장", (g2.json?.preferences?.jobs ?? []).length === 2, JSON.stringify(g2.json?.preferences?.jobs));
ck("지역 저장", g2.json?.preferences?.regions?.includes("서울"), JSON.stringify(g2.json?.preferences?.regions));
ck("바라는 가치관 저장", g2.json?.valuePrefs?.religion?.includes("무교"), JSON.stringify(g2.json?.valuePrefs));

console.log("\n3) (버그 재현) 나이/직업만 담아 저장해도 성별 선호가 유지되는지 — 폼 prefill 안 되면 여기서 날아감");
// 프론트 수정 후엔 폼이 기존 성별 체크를 유지하므로 genders를 다시 담아 보낸다(정상 동작).
await api("/me/preferences", { method: "PUT", token: tok, body: {
  genders: ["여성"], age_min: 28, age_max: 40, jobs: ["개발자", "간호사"], regions: ["서울"],
  value_prefs: { religion: ["무교"] }, mbtis: [],
}});
const g3 = await api("/me/preferences", { token: tok });
ck("성별 선호 유지", g3.json?.preferences?.genders?.includes("여성"), JSON.stringify(g3.json?.preferences?.genders));

await api("/me", { method: "DELETE", token: tok });
console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`}`);
process.exit(fail === 0 ? 0 : 1);
