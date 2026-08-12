// 직군/지역 선택 + 지역 prefix 매칭 검증.
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const CODE = process.env.INVITE_CODE;
if (!CODE) throw new Error("INVITE_CODE 필요");
const rnd = Math.random().toString(36).slice(2, 7);
let fail = 0;
const ck = (n, c, x = "") => { console.log(`${c ? "  ok " : "FAIL "} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
async function signup(suffix, gender, extra) {
  const r = await api("/auth/signup", { method: "POST", body: {
    code: CODE, role: "member", name: `rg_${rnd}_${suffix}`, pin: "123456", agree: true,
    gender, age: 30, keywords: ["영화"], ...extra,
  }});
  if (r.status !== 200) throw new Error(`가입 실패(${suffix}): ` + r.text.slice(0, 200));
  return r.json;
}

// A: 서울 강남구 거주 남성. B: 여성이고 '서울 전체' 선호 → A가 B 추천에 떠야 함(prefix 매칭)
console.log("1) 내 직군/지역이 선택값으로 저장되는지");
const a = await signup("a", "남성", { job: "IT·개발", region: "서울 강남구" });
ck("직군 저장", a.user.job === "IT·개발", a.user.job);
ck("지역(구 단위) 저장", a.user.region === "서울 강남구", a.user.region);

const b = await signup("b", "여성", {
  region: "서울 서초구",
  pref_genders: ["남성"], pref_jobs: ["IT·개발"], pref_regions: ["서울"], // 서울 전체
});

console.log("\n2) 지역 prefix 매칭: B의 '서울 전체' 선호가 A('서울 강남구')를 커버");
const recB = await api("/recommendations", { token: b.token });
ck("A가 B 추천에 노출", (recB.json?.candidates ?? []).some((c) => c.id === a.user.id), `${recB.json?.candidates?.length}명`);

console.log("\n3) 반대로 좁은 선호는 거른다: C는 '서울 송파구'만 원함 → A(강남구) 제외");
const c = await signup("c", "여성", { pref_genders: ["남성"], pref_regions: ["서울 송파구"] });
const recC = await api("/recommendations", { token: c.token });
ck("A(강남)가 C(송파 선호) 추천에서 제외", !(recC.json?.candidates ?? []).some((x) => x.id === a.user.id));

console.log("\n4) 직군 선호 필터: D는 '의료·보건'만 원함 → A(IT) 제외");
const d = await signup("d", "여성", { pref_genders: ["남성"], pref_jobs: ["의료·보건"] });
const recD = await api("/recommendations", { token: d.token });
ck("A(IT)가 D(의료 선호) 추천에서 제외", !(recD.json?.candidates ?? []).some((x) => x.id === a.user.id));

// 정리
for (const u of [a, b, c, d]) await api("/me", { method: "DELETE", token: u.token });
console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`}`);
process.exit(fail === 0 ? 0 : 1);
