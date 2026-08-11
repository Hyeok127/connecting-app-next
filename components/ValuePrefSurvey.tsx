"use client";
import { useState } from "react";
import { VALUE_DIMENSIONS } from "@/lib/values";

// 상대에게 바라는 가치관(선호). 항목별로 허용하는 값을 여러 개 고를 수 있고, 아무것도 안 고르면 "상관없음".
// 선택값은 name="value_prefs"의 hidden input에 JSON({dim:[값...]})으로 담겨 제출된다.
export function ValuePrefSurvey({ defaultValue = {} }: { defaultValue?: Record<string, string[]> }) {
  const [sel, setSel] = useState<Record<string, string[]>>(defaultValue);
  const toggle = (key: string, opt: string) =>
    setSel((p) => {
      const cur = p[key] ?? [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      const out = { ...p };
      if (next.length) out[key] = next;
      else delete out[key];
      return out;
    });

  return (
    <div>
      <input type="hidden" name="value_prefs" value={JSON.stringify(sel)} />
      <div className="space-y-3">
        {VALUE_DIMENSIONS.map((d) => {
          const cur = sel[d.key] ?? [];
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
