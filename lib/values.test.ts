// lib/values.test.ts — 가치관 선호 + 중요도 로직 검증
//
// 실행: npm test  (node --experimental-strip-types --test)
//
// 이 저장소에는 그동안 자동화 테스트가 없었다(smoke_*.mjs는 실 DB가 필요하다).
// values.ts는 외부 의존이 없는 순수 함수 묶음이라 가장 먼저 테스트를 붙일 수 있는 곳이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanValuePrefs,
  parseValuePrefs,
  valuePreferenceScore,
  violatesDealbreaker,
  acceptedOnly,
  MAX_DEALBREAKERS,
  intentConflict,
  INTENT_SERIOUS,
  INTENT_NATURAL,
  INTENT_CASUAL,
} from "./values.ts";

test("구형 배열 저장분을 importance 1로 승격한다 (마이그레이션 불필요)", () => {
  const p = cleanValuePrefs({ smoke: ["비흡연"], religion: ["무교", "불교"] });
  assert.deepEqual(p.smoke, { accepted: ["비흡연"], importance: 1 });
  assert.deepEqual(p.religion, { accepted: ["무교", "불교"], importance: 1 });
});

test("신형 객체는 그대로 유지한다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 3 } });
  assert.equal(p.smoke.importance, 3);
});

test("허용값이 옵션 집합 밖이면 버린다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["없는값"], importance: 3 } });
  assert.equal(p.smoke, undefined);
});

test("허용값이 비면 항목 자체를 만들지 않는다 (= 상관없음)", () => {
  const p = cleanValuePrefs({ smoke: { accepted: [], importance: 3 } });
  assert.equal(p.smoke, undefined);
});

test("잘못된 importance는 1로 정규화한다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 99 } });
  assert.equal(p.smoke.importance, 1);
});

test(`절대조건 상한 ${MAX_DEALBREAKERS}개 초과분은 거절이 아니라 "중요"(2)로 강등한다`, () => {
  const p = cleanValuePrefs({
    smoke: { accepted: ["비흡연"], importance: 3 },
    drink: { accepted: ["안 마심"], importance: 3 },
    tattoo: { accepted: ["없음"], importance: 3 },
    religion: { accepted: ["무교"], importance: 3 }, // 4번째 → 강등
  });
  const dealbreakers = Object.values(p).filter((x) => x.importance === 3).length;
  assert.equal(dealbreakers, MAX_DEALBREAKERS);
  assert.equal(p.religion.importance, 2);
});

test("중요도가 점수에 실제로 반영된다 — 예전에는 전부 1점이었다", () => {
  const vals = { smoke: "비흡연", tattoo: "없음" };
  const nice = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 1 } });
  const important = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 2 } });
  assert.ok(
    valuePreferenceScore(important, vals) > valuePreferenceScore(nice, vals),
    "중요(2)가 있으면 좋음(1)보다 높은 점수여야 한다"
  );
});

test("절대조건은 점수 가산 0 — 하드필터에서 이미 걸러져 변별력이 없다", () => {
  const vals = { smoke: "비흡연" };
  const db = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 3 } });
  assert.equal(valuePreferenceScore(db, vals), 0);
});

test("불일치는 점수를 주지 않는다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 2 } });
  assert.equal(valuePreferenceScore(p, { smoke: "매일" }), 0);
});

test("절대조건: 알려진 불일치는 거른다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 3 } });
  assert.equal(violatesDealbreaker(p, { smoke: "자주" }), true);
  assert.equal(violatesDealbreaker(p, { smoke: "비흡연" }), false);
});

test("절대조건: 상대가 미응답이면 거르지 않는다 (후보풀 붕괴 방지)", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 3 } });
  assert.equal(violatesDealbreaker(p, {}), false);
});

test("중요도 1·2는 하드필터가 아니다 — 불일치해도 후보로 남는다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 2 } });
  assert.equal(violatesDealbreaker(p, { smoke: "매일" }), false);
});

test("parseValuePrefs는 JSON 문자열·객체·null을 모두 받는다", () => {
  assert.deepEqual(parseValuePrefs(null), {});
  assert.deepEqual(parseValuePrefs("깨진 JSON"), {});
  assert.equal(parseValuePrefs('{"smoke":["비흡연"]}').smoke.importance, 1);
  assert.equal(parseValuePrefs({ smoke: ["비흡연"] }).smoke.importance, 1);
});

test("acceptedOnly는 관리자 화면용 구형 형식을 그대로 재현한다", () => {
  const p = cleanValuePrefs({ smoke: { accepted: ["비흡연"], importance: 3 } });
  assert.deepEqual(acceptedOnly(p), { smoke: ["비흡연"] });
});

// ── 관계 지향(intent) ──

test("진지한 만남 ↔ 가볍게는 정면충돌로 막는다 (양방향)", () => {
  const serious = { intent: INTENT_SERIOUS };
  const casual = { intent: INTENT_CASUAL };
  assert.equal(intentConflict(serious, casual), true);
  assert.equal(intentConflict(casual, serious), true);
});

test("'자연스럽게'는 양쪽 모두와 매칭 가능 — 멀티모드의 연결고리", () => {
  const natural = { intent: INTENT_NATURAL };
  assert.equal(intentConflict(natural, { intent: INTENT_SERIOUS }), false);
  assert.equal(intentConflict(natural, { intent: INTENT_CASUAL }), false);
});

test("같은 지향끼리는 당연히 충돌하지 않는다", () => {
  assert.equal(intentConflict({ intent: INTENT_SERIOUS }, { intent: INTENT_SERIOUS }), false);
  assert.equal(intentConflict({ intent: INTENT_CASUAL }, { intent: INTENT_CASUAL }), false);
});

test("한쪽이라도 미응답이면 막지 않는다 (후보풀 붕괴 방지)", () => {
  assert.equal(intentConflict({ intent: INTENT_SERIOUS }, {}), false);
  assert.equal(intentConflict({}, { intent: INTENT_CASUAL }), false);
  assert.equal(intentConflict({}, {}), false);
});

test("intent도 다른 가치관 축과 똑같이 3단 구조를 물려받는다", () => {
  const p = cleanValuePrefs({ intent: { accepted: [INTENT_SERIOUS], importance: 3 } });
  assert.deepEqual(p.intent, { accepted: [INTENT_SERIOUS], importance: 3 });
  assert.equal(violatesDealbreaker(p, { intent: INTENT_CASUAL }), true);
  assert.equal(violatesDealbreaker(p, { intent: INTENT_SERIOUS }), false);
});
