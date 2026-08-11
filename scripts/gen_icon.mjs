// 앱 아이콘 생성기 — '교집합' 컨셉(겹친 두 원 = 상호 3순위 교집합 매칭).
// 4배 슈퍼샘플링으로 다운샘플해 곡선을 부드럽게(안티에일리어싱) 만든다.
// 실행: node scripts/gen_icon.mjs  → public/icon-192.png, icon-512.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pngjs";

const { PNG } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PALETTE = {
  0: [0, 0, 0, 0], // 투명(라운드 사각 밖)
  1: [124, 45, 62, 255], // wine  배경
  2: [245, 235, 224, 255], // cream 왼쪽 원
  3: [201, 162, 63, 255], // gold  오른쪽 원
  4: [226, 205, 150, 255], // blend 교집합
};
const F = 4; // 슈퍼샘플 배율

function set(buf, S, x, y, id) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = S * y + x;
  if (buf[i] === 0) return; // 라운드 사각 밖은 유지
  buf[i] = id;
}

// 겹친 두 원. 교집합은 blend 색으로 채운다.
function draw(buf, S) {
  const R = S * 0.2;
  const lx = S * 0.41;
  const rx = S * 0.59;
  const cy = S / 2;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let x = Math.floor(lx - R); x <= Math.ceil(rx + R); x++) {
      const inL = Math.hypot(x - lx, y - cy) <= R;
      const inR = Math.hypot(x - rx, y - cy) <= R;
      if (inL && inR) set(buf, S, x, y, 4);
      else if (inL) set(buf, S, x, y, 2);
      else if (inR) set(buf, S, x, y, 3);
    }
}

function render(size) {
  const S = size * F;
  const buf = new Uint8Array(S * S);
  const r = S * 0.22; // 라운드 반경
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const cx = x < r ? r - x : x > S - r ? x - (S - r) : 0;
      const cy = y < r ? r - y : y > S - r ? y - (S - r) : 0;
      buf[S * y + x] = cx > 0 && cy > 0 && cx * cx + cy * cy > r * r ? 0 : 1;
    }
  draw(buf, S);

  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let sy = 0; sy < F; sy++)
        for (let sx = 0; sx < F; sx++) {
          const c = PALETTE[buf[S * (y * F + sy) + (x * F + sx)]];
          const a = c[3] / 255;
          R += c[0] * a;
          G += c[1] * a;
          B += c[2] * a;
          A += c[3];
        }
      const n = F * F;
      const aAvg = A / n;
      const norm = aAvg > 0 ? 255 / aAvg : 0; // 알파 프리멀티플라이 해제
      const idx = (size * y + x) << 2;
      png.data[idx] = Math.round((R / n) * norm);
      png.data[idx + 1] = Math.round((G / n) * norm);
      png.data[idx + 2] = Math.round((B / n) * norm);
      png.data[idx + 3] = Math.round(aAvg);
    }
  return png;
}

for (const size of [192, 512]) {
  const out = path.join(__dirname, "..", "public", `icon-${size}.png`);
  fs.writeFileSync(out, PNG.sync.write(render(size)));
  console.log("wrote", out);
}
