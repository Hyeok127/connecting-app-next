"use client";
import { useState } from "react";
import { KEYWORD_CATALOG, MAX_KEYWORDS } from "@/lib/keywords";

// 카테고리별 칩 선택. 선택값은 name 필드의 hidden input으로 내보내 FormData.getAll(name)로 수집된다.
export function KeywordPicker({
  name,
  label,
  hint,
  defaultSelected = [],
  max = MAX_KEYWORDS,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultSelected?: string[];
  max?: number;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected.slice(0, max));

  const toggle = (kw: string) => {
    setSelected((prev) => {
      if (prev.includes(kw)) return prev.filter((k) => k !== kw);
      if (prev.length >= max) return prev; // 상한 도달 시 무시
      return [...prev, kw];
    });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-soft">{label}</span>
        <span className="text-xs text-ink-faint">
          {selected.length}/{max}
        </span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}

      {/* FormData로 수집되는 실제 값 */}
      {selected.map((k) => (
        <input key={k} type="hidden" name={name} value={k} />
      ))}

      <div className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-line bg-cream/40 p-3">
        {KEYWORD_CATALOG.map((cat) => (
          <div key={cat.key}>
            <p className="mb-1 text-xs font-semibold text-ink-faint">{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.items.map((kw) => {
                const on = selected.includes(kw);
                const full = !on && selected.length >= max;
                return (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => toggle(kw)}
                    disabled={full}
                    className={
                      on
                        ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                        : `rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine-500 hover:text-wine-700 ${full ? "opacity-40" : ""}`
                    }
                  >
                    {kw}
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
