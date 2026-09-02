"use client";
import { useState } from "react";
import { VALUE_DIMENSIONS, IMPORTANCE_LABELS, MAX_DEALBREAKERS, type ValuePrefs } from "@/lib/values";

// 상대에게 바라는 가치관(선호) + 중요도.
// 항목별로 허용하는 값을 여러 개 고를 수 있고, 아무것도 안 고르면 "상관없음".
// 값을 고른 항목에는 중요도를 함께 받는다 — 이게 없으면 "반드시 무교"와
// "문신은 없는 편이 좋다"가 매칭 점수에서 똑같이 취급된다.
//
// 제출 형식: name="value_prefs" hidden input에 JSON
//   { "smoke": { "accepted": ["비흡연"], "importance": 3 } }
export function ValuePrefSurvey({ defaultValue = {} }: { defaultValue?: ValuePrefs }) {
  const [sel, setSel] = useState<ValuePrefs>(defaultValue);

  const dealbreakerCount = Object.values(sel).filter((p) => p.importance === 3).length;

  const toggle = (key: string, opt: string) =>
    setSel((p) => {
      const cur = p[key]?.accepted ?? [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      const out = { ...p };
      if (next.length) out[key] = { accepted: next, importance: p[key]?.importance ?? 1 };
      else delete out[key];
      return out;
    });

  const setImportance = (key: string, importance: 0 | 1 | 2 | 3) =>
    setSel((p) => {
      const cur = p[key];
      if (!cur) return p;
      // 절대조건 상한은 화면에서도 막는다 — 서버는 초과분을 "중요"로 강등한다.
      if (importance === 3 && cur.importance !== 3 && dealbreakerCount >= MAX_DEALBREAKERS) return p;
      return { ...p, [key]: { ...cur, importance } };
    });

  return (
    <div>
      <input type="hidden" name="value_prefs" value={JSON.stringify(sel)} />
      <p className="mb-2 text-xs text-ink-faint">
        고른 항목에 중요도를 정해주세요. <b>절대조건</b>은 최대 {MAX_DEALBREAKERS}개까지예요
        (현재 {dealbreakerCount}개). 너무 많이 걸면 추천할 사람이 없어져요.
        <br />
        절대조건은 <b>상대가 그 항목에 답한 경우에만</b> 걸러요 — 아직 안 쓴 사람은 걸러지지 않아요.
      </p>
      <div className="space-y-3">
        {VALUE_DIMENSIONS.map((d) => {
          const cur = sel[d.key]?.accepted ?? [];
          const imp = sel[d.key]?.importance ?? 1;
          return (
            <div key={d.key}>
              <span className="text-sm font-medium text-ink-soft">
                {d.label}{" "}
                <span className="text-xs font-normal text-ink-faint">
                  {cur.length ? "(선택한 값만 허용)" : "(상관없음)"}
                </span>
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {d.options.map((opt) => {
                  const on = cur.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(d.key, opt.value)}
                      className={
                        on
                          ? "rounded-full border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-paper"
                          : "rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-emerald-500 hover:text-emerald-700"
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {cur.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink-faint">얼마나 중요한가요?</span>
                  {([1, 2, 3] as const).map((lv) => {
                    const on = imp === lv;
                    const blocked = lv === 3 && !on && dealbreakerCount >= MAX_DEALBREAKERS;
                    return (
                      <button
                        key={lv}
                        type="button"
                        aria-pressed={on}
                        disabled={blocked}
                        title={blocked ? `절대조건은 최대 ${MAX_DEALBREAKERS}개까지예요.` : undefined}
                        onClick={() => setImportance(d.key, lv)}
                        className={
                          on
                            ? "rounded-full border border-wine-600 bg-wine-600 px-2 py-0.5 text-xs font-medium text-paper"
                            : "rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink-soft transition hover:border-wine-400 disabled:cursor-not-allowed disabled:opacity-40"
                        }
                      >
                        {IMPORTANCE_LABELS[lv]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
