// 특정 계정의 PIN을 설정(개발 편의). bcrypt 해시 후 Management API로 UPDATE.
// 사용: node scripts/set_pin.mjs <name> <pin>   [-p 로 운영]
import fs from "node:fs";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);
const prod = args.includes("-p");
const [name, pin] = args.filter((a) => a !== "-p");
if (!name || !pin) { console.error("사용법: node scripts/set_pin.mjs <name> <pin> [-p]"); process.exit(1); }

const envFile = prod ? ".env.local.prod.bak" : ".env.local";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const token = env.SUPABASE_ACCESS_TOKEN;
const url = fs.readFileSync(envFile, "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)[1].trim();
const ref = url.replace(/^https:\/\/([^.]+)\..*$/, "$1");

const hash = bcrypt.hashSync(pin, 10);
const sql = `update users set pin_hash = '${hash}' where name = '${name.replace(/'/g, "''")}'`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
console.log(res.ok ? `[${ref}] '${name}' PIN 설정 완료 → ${pin}` : `실패 ${res.status}: ${await res.text()}`);
