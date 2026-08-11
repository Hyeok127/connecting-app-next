"use client";
import { useState } from "react";
import { VALUE_DIMENSIONS } from "@/lib/values";

// 가치관 설문(흡연/음주/문신/종교). 각 항목 선택(다시 누르면 해제=무응답).
// 선택값은 name="values"의 hidden input에 JSON으로 담겨 폼 제출 시 수집된다.
export function ValuesSurvey({ defaultValues = {} }: { defaultValues?: Record<string, string> }) {
  const [sel, setSel] = useState<Record<string, string>>(defaultValues);
  const pick = (key: string, opt: string) =>
    setSel((p) => ({ ...p, [key]: p[key] === opt ? "" : opt }));

  const answered = Object.fromEntries(Object.entries(sel).filter(([, v]) => v));

  return (
    <div>
      <input type="hidden" name="values" value={JSON.stringify(answered)} />
      <div className="space-y-3">
        {VALUE_DIMENSIONS.map((d) => (
          <div key={d.key}>
            <span className="text-sm font-medium text-ink-soft">
              {d.label} <span className="text-xs font-normal text-ink-faint">(선택)</span>
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.options.map((opt) => {
                const on = sel[d.key] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pick(d.key, opt)}
                    className={
                      on
                        ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                        : "rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine-500 hover:text-wine-700"
                    }
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
