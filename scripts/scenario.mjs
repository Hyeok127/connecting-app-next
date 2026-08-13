// 3일 시나리오 드라이버. 하루씩 호출: node scripts/scenario.mjs <day>
// 서버는 해당 날짜의 CYCLE_OVERRIDE로 떠 있어야 한다(호출측이 세팅).
// 모든 봇 계정 PIN은 111111. 배치는 관리자(dev-root/111111)로 /admin/run-batch 호출.
const BASE = process.env.BASE || "http://127.0.0.1:3211/api";
const CODE = process.env.INVITE_CODE || "DEVROOT9";
const PIN = "111111";
const day = Number(process.argv[2] || "1");

async function api(path, { method = "GET", token, body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
const log = (...a) => console.log("  ", ...a);

async function signup(name, extra) {
  const r = await api("/auth/signup", { method: "POST", body: { code: CODE, role: "member", name, pin: PIN, agree: true, keywords: ["영화", "여행".slice(0, 0) || "커피"], ...extra } });
  if (r.status !== 200) { console.error(`가입 실패 ${name}: ${r.text.slice(0, 160)}`); return null; }
  log(`가입: ${name} (${extra.gender}, ${extra.job_type}/${extra.job_role}, ${extra.region})`);
  return r.json.token;
}
async function login(name) {
  const r = await api("/auth/login", { method: "POST", body: { name, pin: PIN } });
  return r.status === 200 ? r.json.token : null;
}
async function idByName(name) {
  const r = await api("/auth/login", { method: "POST", body: { name, pin: PIN } });
  return r.json?.user?.id ?? null;
}
async function rank(token, targetIds) {
  await api("/ranking", { method: "PUT", token, body: { target_ids: targetIds } });
}
async function runBatch(cycle) {
  const admin = await login("dev-root");
  const r = await api("/admin/run-batch", { method: "POST", token: admin });
  log(`배치 실행: ${r.json?.result ?? r.text.slice(0, 80)}`);
}
async function myMatch(token) {
  const r = await api("/matches", { token });
  return (r.json?.matches ?? [])[0];
}
async function accept(token, contact) {
  const m = await myMatch(token);
  if (!m) return null;
  const r = await api(`/matches/${m.id}/respond`, { method: "POST", token, body: { action: "accept", contact } });
  return r.json?.state;
}
async function reject(token) {
  const m = await myMatch(token);
  if (!m) return null;
  await api(`/matches/${m.id}/respond`, { method: "POST", token, body: { action: "reject" } });
}
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
async function uploadPhotoAndConsent(token) {
  const up = await api("/photos/upload-url", { method: "POST", token, body: { ext: "png" } });
  await fetch(up.json.uploadUrl, { method: "PUT", headers: { "Content-Type": up.json.contentType }, body: PNG });
  await api("/me", { method: "PUT", token, body: { photos: [up.json.objectPath] } });
  const m = await myMatch(token);
  const r = await api(`/matches/${m.id}/photo-consent`, { method: "POST", token, body: { agree: true } });
  return r.json?.photos_exchanged;
}
async function feedback(token, decision, extra = {}) {
  const r = await api("/me/meeting/feedback", { method: "POST", token, body: { decision, ...extra } });
  return r.json;
}

const M = (region, jt, jr) => ({ gender: "남성", age: 30, region, job_type: jt, job_role: jr, pref_genders: ["여성"] });
const F = (region, jt, jr) => ({ gender: "여성", age: 28, region, job_type: jt, job_role: jr, pref_genders: ["남성"] });

async function main() {
  const cycle = process.env.SIM_CYCLE || "";
  console.log(`\n===== Day ${day} (cycle=${cycle}) =====`);

  if (day === 1) {
    console.log("[가입] A(남)·B(여)");
    const A = await signup("민준", M("서울 강남구", "스타트업", "개발·엔지니어링"));
    const B = await signup("서연", F("서울 서초구", "대기업", "디자인"));
    const aId = await idByName("민준"), bId = await idByName("서연");
    console.log("[순위] 서로 1순위");
    await rank(A, [bId]); await rank(B, [aId]);
    await runBatch(cycle);
    console.log("[응답] 둘 다 수락(연락처 입력)");
    log("A 수락:", await accept(A, "카톡 minjun_k"));
    log("B 수락:", await accept(B, "010-1111-2222"));
    console.log("[사진] 둘 다 업로드+교환 동의");
    log("A 동의 후 교환:", await uploadPhotoAndConsent(A));
    log("B 동의 후 교환:", await uploadPhotoAndConsent(B));
    console.log("→ Day1 결과: 민준·서연 매칭 성사 + 연락처 공개 + 사진 교환, 만남 진행 중");
  }

  if (day === 2) {
    console.log("[신규 유입] C(남)·D(여), 그리고 짝사랑 E(남)");
    const C = await signup("지호", M("경기 성남시", "금융권", "금융·투자"));
    const D = await signup("하은", F("서울 마포구", "공공기관·공기업", "교육"));
    const E = await signup("도윤", M("서울 강서구", "중견·중소기업", "영업"));
    const cId = await idByName("지호"), dId = await idByName("하은");
    console.log("[순위] C↔D 상호 1순위, E는 D를 담지만 D는 E를 안 담음(짝사랑)");
    await rank(C, [dId]); await rank(D, [cId]); await rank(E, [dId]);
    await runBatch(cycle);
    console.log("[응답] C 수락, D 수락 → 성사");
    log("C 수락:", await accept(C, "카톡 jiho88"));
    log("D 수락:", await accept(D, "010-3333-4444"));
    console.log("[Day1 커플] 민준·서연 만남 후 둘 다 '교제 시작'");
    const A = await login("민준"), B = await login("서연");
    log("민준 교제시작:", (await feedback(A, "continue"))?.status ?? "-");
    log("서연 교제시작:", (await feedback(B, "continue"))?.status ?? "-");
    console.log("→ Day2 결과: 지호·하은 성사(연락처 공개), 도윤은 매칭 없음, 민준·서연은 교제 시작→휴면");
  }

  if (day === 3) {
    console.log("[신규 유입] F(남)·G(여)");
    const Fk = await signup("우진", M("서울 송파구", "외국계", "마케팅·광고"));
    const G = await signup("지우", F("경기 고양시", "전문직", "의료·보건"));
    const fId = await idByName("우진"), gId = await idByName("지우");
    console.log("[순위] F↔G 상호 1순위");
    await rank(Fk, [gId]); await rank(G, [fId]);
    await runBatch(cycle);
    console.log("[응답] F 수락, G 거절(불발 케이스)");
    log("F 수락:", await accept(Fk, "카톡 woojin"));
    await reject(G); log("G 거절");
    console.log("[Day2 커플] 지호·하은 만남 후 엇갈림(한쪽 종료)");
    const C = await login("지호"), D = await login("하은");
    log("지호 교제시작:", (await feedback(C, "continue"))?.resolved ?? "대기");
    log("하은 종료:", (await feedback(D, "close", { reason_category: "가치관 차이" }))?.status ?? "-");
    console.log("→ Day3 결과: 우진·지우 불발(거절), 지호·하은 만남 종료→active 복귀");
  }
}
main().then(() => console.log("완료.\n")).catch((e) => { console.error(e); process.exit(1); });
