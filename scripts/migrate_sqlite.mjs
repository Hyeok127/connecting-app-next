#!/usr/bin/env node
// scripts/migrate_sqlite.mjs — 기존 SQLite(data/intro.db) → Supabase Postgres 이관
// 사용법:
//   cd ~/connecting-app-next
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OLD_DIR=/home/jsh/connecting-app \
//     node scripts/migrate_sqlite.mjs
// better-sqlite3은 기존 프로젝트의 node_modules를, supabase는 이 프로젝트의 node_modules를 사용.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const betterSqlite3 = require(path.join(process.env.OLD_DIR || "/home/jsh/connecting-app", "node_modules/better-sqlite3"));
const { createClient } = require(path.join("/home/jsh/connecting-app-next", "node_modules/@supabase/supabase-js"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const OLD_DIR = process.env.OLD_DIR || "/home/jsh/connecting-app";
const dbPath = path.join(OLD_DIR, "db", "intro.db");
const uploadsDir = path.join(OLD_DIR, "uploads");

const old = new betterSqlite3(dbPath, { readonly: true });
const sb = createClient(url, key, { auth: { persistSession: false } });

const BUCKET = "photos";

async function uploadPhoto(userId, oldPhotoPath) {
  const file = path.basename(oldPhotoPath);
  const src = path.join(uploadsDir, file);
  if (!fs.existsSync(src)) return oldPhotoPath; // 없는 파일은 원본 유지(서명 URL 실패 시 확인)
  const objectPath = `${userId}/${file}`;
  const buf = fs.readFileSync(src);
  const { error } = await sb.storage.from(BUCKET).upload(objectPath, buf, {
    contentType: "image/png",
    upsert: true,
  });
  if (error && !String(error.message).includes("already exists")) {
    console.error("  업로드 실패:", objectPath, error.message);
    return oldPhotoPath;
  }
  return objectPath;
}

async function migrate() {
  console.log("== 유저 이관 ==");
  const users = old.prepare("SELECT * FROM users ORDER BY created_at").all();
  for (const u of users) {
    const photos = JSON.parse(u.photos || "[]");
    const newPhotos = [];
    for (const p of photos) newPhotos.push(await uploadPhoto(u.id, p));
    const row = { ...u, photos: JSON.stringify(newPhotos) };
    delete row.trust_score; // 기본값 유지
    const { error } = await sb.from("users").upsert(row, { onConflict: "id" });
    if (error) console.error("  유저 실패:", u.name, error.message);
    else console.log(`  ✓ ${u.name} (${u.id}) 사진 ${newPhotos.length}장`);
  }

  console.log("== preferences ==");
  for (const r of old.prepare("SELECT * FROM preferences").all()) {
    const { error } = await sb.from("preferences").upsert(r, { onConflict: "user_id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== rankings ==");
  for (const r of old.prepare("SELECT * FROM rankings").all()) {
    const { error } = await sb.from("rankings").upsert(r, { onConflict: "user_id,cycle_date,target_id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== matches ==");
  for (const r of old.prepare("SELECT * FROM matches ORDER BY created_at").all()) {
    const { error } = await sb.from("matches").upsert(r, { onConflict: "id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== meetings ==");
  for (const r of old.prepare("SELECT * FROM meetings").all()) {
    const { error } = await sb.from("meetings").upsert(r, { onConflict: "id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== feedbacks ==");
  for (const r of old.prepare("SELECT * FROM feedbacks").all()) {
    const { error } = await sb.from("feedbacks").upsert(r, { onConflict: "id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== point_events ==");
  for (const r of old.prepare("SELECT * FROM point_events").all()) {
    const { error } = await sb.from("point_events").upsert(r, { onConflict: "id" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("== sessions ==");
  for (const r of old.prepare("SELECT * FROM sessions").all()) {
    const { error } = await sb.from("sessions").upsert(r, { onConflict: "token" });
    if (error) console.error("  실패:", error.message);
  }

  console.log("이관 완료 ✅");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
