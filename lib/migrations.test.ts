// lib/migrations.test.ts — 마이그레이션 적용 상태 대조 로직 (P6-1)
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffMigrations } from "./migrations.ts";

test("적용 기록이 없는 파일은 pending으로 잡힌다", () => {
  const r = diffMigrations(["001_init", "002_cron", "011_fix"], ["001_init", "002_cron"]);
  assert.deepEqual(r.pending, ["011_fix"]);
  assert.deepEqual(r.orphan, []);
});

test("전부 적용됐으면 pending이 비어 있다", () => {
  const r = diffMigrations(["001_init", "002_cron"], ["002_cron", "001_init"]);
  assert.deepEqual(r.pending, []);
});

test("DB에만 있고 저장소에 없는 버전은 orphan으로 보고한다", () => {
  // 파일이 지워졌거나 다른 브랜치에서 적용된 흔적 — 조용히 넘기면 안 된다.
  const r = diffMigrations(["001_init"], ["001_init", "099_from_another_branch"]);
  assert.deepEqual(r.orphan, ["099_from_another_branch"]);
  assert.deepEqual(r.pending, []);
});

test("의도적 보류분(006)도 pending에 나타난다 — 숨기지 않는다", () => {
  // 006_cleanup은 의도적 미적용이지만, "안 되어 있다"는 사실 자체는 보여야 한다.
  // 의도 여부는 사람이 판단할 몫이지 시스템이 감출 일이 아니다.
  const repo = ["005_normalize", "006_cleanup", "007_job_split"];
  const r = diffMigrations(repo, ["005_normalize", "007_job_split"]);
  assert.deepEqual(r.pending, ["006_cleanup"]);
});

test("양쪽 다 비어도 안전하다", () => {
  const r = diffMigrations([], []);
  assert.deepEqual(r, { pending: [], orphan: [] });
});

test("결과는 정렬돼 반환된다 (출력이 흔들리지 않게)", () => {
  const r = diffMigrations(["003_c", "001_a", "002_b"], []);
  assert.deepEqual(r.pending, ["001_a", "002_b", "003_c"]);
});
