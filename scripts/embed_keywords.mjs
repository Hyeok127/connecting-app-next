// scripts/embed_keywords.mjs — 고정 키워드 세트의 임베딩을 사전계산해 lib/keyword_vectors.json 생성.
// 런타임(Vercel)에서는 이 JSON만 읽어 코사인 유사도를 계산하므로, 이 스크립트/모델은
// 배포에 포함되지 않는다(개발 시 1회 실행). 키워드 세트를 바꾸면 다시 실행할 것.
//   실행: node scripts/embed_keywords.mjs   (사전에 esbuild로 _keywords_bundle.mjs 생성 필요)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pipeline } from "@xenova/transformers";
import { ALL_KEYWORDS } from "./_keywords_bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"; // 다국어(한국어 포함), 384차원

const extractor = await pipeline("feature-extraction", MODEL);
const raw = {};
for (const kw of ALL_KEYWORDS) {
  const out = await extractor(kw, { pooling: "mean", normalize: true });
  raw[kw] = Array.from(out.data);
}

// anisotropy 교정: 전체 평균 벡터를 빼고(centering) 다시 정규화 → baseline 유사도 감소, 변별력↑
const dim = raw[ALL_KEYWORDS[0]].length;
const mean = new Array(dim).fill(0);
for (const kw of ALL_KEYWORDS) for (let i = 0; i < dim; i++) mean[i] += raw[kw][i];
for (let i = 0; i < dim; i++) mean[i] /= ALL_KEYWORDS.length;

const vectors = {};
for (const kw of ALL_KEYWORDS) {
  const c = raw[kw].map((x, i) => x - mean[i]);
  const norm = Math.sqrt(c.reduce((s, x) => s + x * x, 0)) || 1;
  vectors[kw] = c.map((x) => Math.round((x / norm) * 1e5) / 1e5); // 단위벡터, 소수 5자리
}

const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const check = (a, b) => `${a}~${b}=${cos(vectors[a], vectors[b]).toFixed(3)}`;
console.log("sanity(centered):", [
  check("등산", "캠핑"),
  check("등산", "클라이밍"),
  check("등산", "재테크"),
  check("와인", "위스키"),
  check("집순이", "밖순이"),
  check("힙합", "재테크"),
  check("독서", "글쓰기"),
  check("헬스", "K팝"),
].join("  "));
writeFileSync(
  join(here, "..", "lib", "keyword_vectors.json"),
  JSON.stringify({ model: MODEL, dim, vectors })
);
console.log(`저장 완료: lib/keyword_vectors.json (${ALL_KEYWORDS.length}개, ${dim}차원)`);
