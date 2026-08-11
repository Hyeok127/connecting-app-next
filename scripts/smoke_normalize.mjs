// 005 전환 후 실제 API 경로 스모크 테스트(개발 서버 대상).
// 가입 → 프로필(가치관/이메일) → 선호 → 추천 → 차단/신고 → 탈퇴까지 새 스키마로 동작하는지 확인.
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const CODE = process.env.INVITE_CODE;
if (!CODE) throw new Error("INVITE_CODE 필요");

const rnd = Math.random().toString(36).slice(2, 8);
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "  ok " : "FAIL "} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비 JSON */
  }
  return { status: res.status, json, text };
}

async function signup(suffix, gender, values, valuePrefs) {
  const r = await api("/auth/signup", {
    method: "POST",
    body: {
      code: CODE,
      role: "member",
      name: `smoke_${rnd}_${suffix}`,
      pin: "123456",
      agree: true,
      gender,
      age: 30,
      job: "테스터",
      region: "서울",
      keywords: ["여행", "영화"],
      values,
      value_prefs: valuePrefs,
      pref_genders: [gender === "남성" ? "여성" : "남성"],
    },
  });
  if (r.status !== 200) throw new Error(`가입 실패 ${r.status}: ${r.text.slice(0, 200)}`);
  return r.json;
}

console.log("1) 가입 — 가치관/바라는 가치관/동의가 새 컬럼에 저장되는지");
const a = await signup("a", "남성", { smoke: "비흡연", religion: "무교" }, { smoke: ["비흡연"] });
const b = await signup("b", "여성", { smoke: "비흡연", religion: "무교" }, {});
check("가입 2건", !!a.token && !!b.token);
check("가치관 반환", a.user.values?.smoke === "비흡연", JSON.stringify(a.user.values));

console.log("\n2) 동의 없이 가입하면 거부되는지");
const noAgree = await api("/auth/signup", {
  method: "POST",
  body: { code: CODE, role: "member", name: `smoke_${rnd}_x`, pin: "123456", gender: "남성", age: 30, keywords: ["여행"] },
});
check("동의 미체크 → 400", noAgree.status === 400, noAgree.json?.error);

console.log("\n3) 프로필 수정 — 가치관 변경");
const put = await api("/me", { method: "PUT", token: a.token, body: { values: { smoke: "가끔", religion: "불교" } } });
check("가치관 수정 반영", put.json?.user?.values?.smoke === "가끔", JSON.stringify(put.json?.user?.values));

console.log("\n4) 알림 이메일 — users.email");
await api("/me/email", { method: "POST", token: a.token, body: { email: "smoke@example.com" } });
const em = await api("/me/email", { token: a.token });
check("이메일 저장/조회", em.json?.email === "smoke@example.com", em.json?.email);

console.log("\n5) 선호 — preferences.value_prefs");
await api("/me/preferences", { method: "PUT", token: a.token, body: { genders: ["여성"], value_prefs: { religion: ["무교"] } } });
const pref = await api("/me/preferences", { token: a.token });
check("바라는 가치관 저장", pref.json?.valuePrefs?.religion?.includes("무교"), JSON.stringify(pref.json?.valuePrefs));

console.log("\n6) 추천 — 서로 노출되는지");
const rec1 = await api("/recommendations", { token: a.token });
const sawB = (rec1.json?.candidates ?? []).some((c) => c.id === b.user.id);
check("추천에 상대 노출", sawB, `${rec1.json?.candidates?.length}명`);

console.log("\n7) 차단 — blocks 테이블 + 추천 제외");
const blk = await api("/moderation", { method: "POST", token: a.token, body: { target_id: b.user.id, kind: "block" } });
check("차단 200", blk.status === 200, blk.text.slice(0, 100));
const blkAgain = await api("/moderation", { method: "POST", token: a.token, body: { target_id: b.user.id, kind: "block" } });
check("중복 차단도 200(멱등)", blkAgain.status === 200, blkAgain.text.slice(0, 100));
const rec2 = await api("/recommendations", { token: a.token });
check("차단 후 추천에서 제외", !(rec2.json?.candidates ?? []).some((c) => c.id === b.user.id));
const rec2b = await api("/recommendations", { token: b.token });
check("차단당한 쪽에서도 제외(양방향)", !(rec2b.json?.candidates ?? []).some((c) => c.id === a.user.id));

console.log("\n8) 차단 해제 → 다시 노출");
await api("/moderation", { method: "POST", token: a.token, body: { target_id: b.user.id, kind: "unblock" } });
const rec3 = await api("/recommendations", { token: a.token });
check("해제 후 재노출", (rec3.json?.candidates ?? []).some((c) => c.id === b.user.id));

console.log("\n9) 신고 — reports 테이블 + 자동 차단");
const rep = await api("/moderation", { method: "POST", token: a.token, body: { target_id: b.user.id, kind: "report", reason: "사칭 의심" } });
check("신고 200", rep.status === 200, rep.text.slice(0, 100));
const rec4 = await api("/recommendations", { token: a.token });
check("신고 후 자동 차단", !(rec4.json?.candidates ?? []).some((c) => c.id === b.user.id));

console.log("\n10) 탈퇴 — cascade로 blocks/reports 함께 삭제되는지");
const del = await api("/me", { method: "DELETE", token: a.token });
check("탈퇴 200", del.status === 200, del.text.slice(0, 120));
const delB = await api("/me", { method: "DELETE", token: b.token });
check("상대도 탈퇴 200", delB.status === 200, delB.text.slice(0, 120));

console.log(`\n${failures === 0 ? "전체 통과" : `실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
