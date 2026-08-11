// 앱 아이콘 생성기(1회용). 와인색 라운드 사각 배경 + 크림색 하트.
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const WINE = [124, 45, 62]; // #7c2d3e
const CREAM = [245, 235, 224]; // 살짝 크림
const BG = WINE;

function heartInside(cx, cy, x, y, s) {
  // 정규화 좌표계에서의 하트 부등식 (범위 대략 [-1.3,1.3])
  const nx = (x - cx) / s;
  const ny = -(y - cy) / s;
  const a = nx * nx + ny * ny - 1;
  return a * a * a - nx * nx * ny * ny * ny <= 0;
}

function gen(size, file) {
  const png = new PNG({ width: size, height: size });
  const r = size * 0.22; // 라운드 반경
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      // 라운드 사각 마스크
      let inside = true;
      const cornerX = x < r ? r - x : x > size - r ? x - (size - r) : 0;
      const cornerY = y < r ? r - y : y > size - r ? y - (size - r) : 0;
      if (cornerX > 0 && cornerY > 0 && cornerX * cornerX + cornerY * cornerY > r * r) inside = false;
      let col = inside ? BG : [0, 0, 0];
      const alpha = inside ? 255 : 0;
      // 하트
      if (inside && heartInside(size / 2, size * 0.47, x, y, size * 0.27)) col = CREAM;
      png.data[idx] = col[0];
      png.data[idx + 1] = col[1];
      png.data[idx + 2] = col[2];
      png.data[idx + 3] = alpha;
    }
  }
  const out = path.join(__dirname, "..", "public", file);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log("wrote", out);
}

gen(192, "icon-192.png");
gen(512, "icon-512.png");
