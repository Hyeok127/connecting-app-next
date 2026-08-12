// 관리자 모니터링 API 검증 — root 계정으로 로그인해 users/matches 응답 확인.
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const tok = process.env.TOKEN; // DB에 직접 발급한 임시 관리자 세션 토큰
if (!tok) throw new Error("TOKEN 필요");

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}

let fail = 0;
const ck = (n, c, x = "") => { console.log(`${c ? "  ok " : "FAIL "} ${n}${x ? " — " + x : ""}`); if (!c) fail++; };

const me = await api("/me", { token: tok });
ck("관리자 세션 유효", me.status === 200 && me.json?.user?.is_admin === true, "is_admin=" + me.json?.user?.is_admin);

console.log("\n=== /admin/users (프로필 상세) ===");
const u = await api("/admin/users", { token: tok });
ck("회원 목록", u.status === 200 && Array.isArray(u.json?.users), `${u.json?.users?.length}명`);
const member = (u.json?.users ?? []).find((x) => x.role === "member");
if (member) {
  ck("keywords 필드 존재", Array.isArray(member.keywords));
  ck("values 필드 존재", typeof member.values === "object");
  ck("prefs 필드 존재(또는 null)", member.prefs === null || typeof member.prefs === "object");
  ck("photo_count 필드", typeof member.photo_count === "number");
  console.log("    샘플:", member.name, "| kw", member.keywords.length, "| values", JSON.stringify(member.values), "| email", member.email);
} else {
  console.log("    (일반 회원 없음 — 필드 검증 스킵)");
}

console.log("\n=== /admin/matches (매칭 현황) ===");
const m = await api("/admin/matches", { token: tok });
ck("매칭 응답", m.status === 200 && Array.isArray(m.json?.matches), `${m.json?.matches?.length}건`);
ck("집계 존재", m.json?.summary && typeof m.json.summary.total === "number", JSON.stringify(m.json?.summary));

console.log("\n=== 권한 차단(비관리자 접근) ===");
const noAuth = await api("/admin/matches");
ck("무인증 401", noAuth.status === 401, String(noAuth.status));

console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`}`);
process.exit(fail === 0 ? 0 : 1);
