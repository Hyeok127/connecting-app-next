// R2 사진 파이프라인 검증: 업로드URL 발급 → presigned PUT → 프로필 저장 → 조회 서명URL로 실제 다운로드.
import fs from "node:fs";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

// 1x1 PNG
const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const pngBytes = Buffer.from(pngB64, "base64");

const s = await api("/auth/signup", { method: "POST", body: { code: CODE, role: "member", name: `r2_${rnd}`, pin: "123456", agree: true, gender: "남성", age: 30, keywords: ["영화"] } });
if (s.status !== 200) throw new Error("가입 실패: " + s.text.slice(0, 200));
const tok = s.json.token;

console.log("1) 업로드 URL 발급");
const up = await api("/photos/upload-url", { method: "POST", token: tok, body: { ext: "png" } });
ck("발급 200 + contentType", up.status === 200 && up.json?.contentType === "image/png", JSON.stringify({ ct: up.json?.contentType, path: up.json?.objectPath }));

console.log("2) presigned PUT로 실제 업로드");
const putRes = await fetch(up.json.uploadUrl, { method: "PUT", headers: { "Content-Type": up.json.contentType }, body: pngBytes });
ck("R2 업로드 200", putRes.status === 200, "status=" + putRes.status);

console.log("3) 프로필에 사진 경로 저장");
const save = await api("/me", { method: "PUT", token: tok, body: { photos: [up.json.objectPath] } });
ck("사진 경로 저장", save.status === 200, save.text.slice(0, 120));

console.log("4) /me 조회 시 서명 URL이 실제 이미지로 열리는지");
const me = await api("/me", { token: tok });
const photoUrl = me.json?.user?.photos?.[0];
ck("서명 URL 존재", !!photoUrl, photoUrl?.slice(0, 60));
if (photoUrl) {
  const img = await fetch(photoUrl);
  const ct = img.headers.get("content-type");
  const buf = Buffer.from(await img.arrayBuffer());
  ck("이미지 다운로드 200 + 바이트 일치", img.status === 200 && buf.length === pngBytes.length, `status=${img.status} ct=${ct} bytes=${buf.length}/${pngBytes.length}`);
}

console.log("5) 탈퇴 시 R2에서 파일 삭제되는지");
const objId = up.json.objectPath.split("/")[0];
await api("/me", { method: "DELETE", token: tok });
// R2에서 해당 유저 폴더 잔여 확인
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const s3 = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const left = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: objId + "/" }));
ck("탈퇴 후 R2에 잔여 파일 없음", (left.KeyCount ?? 0) === 0, `남은 ${left.KeyCount ?? 0}개`);
// 혹시 남았으면 정리
for (const o of left.Contents ?? []) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: o.Key }));

console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`}`);
process.exit(fail === 0 ? 0 : 1);
