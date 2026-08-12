"use client";
import { useState } from "react";

// 칩 선택(직군 등 평면 목록). FormData로 수집되도록 name의 hidden input을 출력.
//   multiple=false: 단일 선택(내 직군) — 하나만 유지
//   multiple=true : 다중 선택(바라는 직군)
export function ChipSelect({
  name,
  options,
  defaultSelected = [],
  multiple = false,
  placeholder,
}: {
  name: string;
  options: readonly string[];
  defaultSelected?: string[];
  multiple?: boolean;
  placeholder?: string;
}) {
  const [sel, setSel] = useState<string[]>(defaultSelected);

  const toggle = (o: string) =>
    setSel((prev) => {
      if (prev.includes(o)) return prev.filter((x) => x !== o);
      return multiple ? [...prev, o] : [o];
    });

  return (
    <div>
      {sel.map((s) => (
        <input key={s} type="hidden" name={name} value={s} />
      ))}
      {placeholder && sel.length === 0 && <p className="mb-1.5 text-xs text-ink-faint">{placeholder}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = sel.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={
                on
                  ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                  : "rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine-500 hover:text-wine-700"
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
