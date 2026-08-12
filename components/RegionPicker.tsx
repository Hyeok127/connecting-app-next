"use client";
import { useState } from "react";
import { REGIONS, regionValue } from "@/lib/profileOptions";

// 지역 선택(2차 드릴다운). 시/도를 누르면 하위 구·시가 펼쳐진다.
//   하위가 있는 시/도(서울·경기·인천): "전체" 또는 개별 구/시 선택
//   하위가 없는 시/도: 시/도 자체가 값
// FormData 수집용 hidden input(name) 출력. single=true면 하나만 유지.
export function RegionPicker({
  name,
  defaultSelected = [],
  single = false,
}: {
  name: string;
  defaultSelected?: string[];
  single?: boolean;
}) {
  const [sel, setSel] = useState<string[]>(defaultSelected);
  const [openSido, setOpenSido] = useState<string | null>(null);

  const add = (v: string) =>
    setSel((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      return single ? [v] : [...prev, v];
    });
  const remove = (v: string) => setSel((prev) => prev.filter((x) => x !== v));

  const group = REGIONS.find((g) => g.sido === openSido);

  return (
    <div>
      {sel.map((s) => (
        <input key={s} type="hidden" name={name} value={s} />
      ))}

      {/* 선택된 값 요약(클릭 시 해제) */}
      {sel.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {sel.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => remove(s)}
              className="rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
            >
              {s} ✕
            </button>
          ))}
        </div>
      )}

      {/* 시/도 */}
      <div className="flex flex-wrap gap-1.5">
        {REGIONS.map((g) => {
          const hasSubs = !!g.subs?.length;
          const active = openSido === g.sido;
          // 하위 없는 시/도는 바로 선택 표시
          const on = !hasSubs && sel.includes(g.sido);
          return (
            <button
              key={g.sido}
              type="button"
              onClick={() => (hasSubs ? setOpenSido(active ? null : g.sido) : add(g.sido))}
              className={
                on
                  ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                  : `rounded-full border px-2.5 py-1 text-xs transition ${
                      active ? "border-wine-500 bg-wine-50 text-wine-700" : "border-line bg-white text-ink-soft hover:border-wine-500 hover:text-wine-700"
                    }`
              }
            >
              {g.sido}
              {hasSubs && <span className="ml-0.5 opacity-60">{active ? "▾" : "▸"}</span>}
            </button>
          );
        })}
      </div>

      {/* 하위 구/시 */}
      {group?.subs && (
        <div className="mt-2 rounded-xl border border-line bg-cream/40 p-3">
          <p className="mb-1.5 text-xs text-ink-faint">{group.sido}의 지역을 고르세요 (여러 개 가능)</p>
          <div className="flex flex-wrap gap-1.5">
            {/* 시/도 전체 */}
            <button
              type="button"
              onClick={() => add(group.sido)}
              className={
                sel.includes(group.sido)
                  ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                  : "rounded-full border border-wine-200 bg-white px-2.5 py-1 text-xs font-medium text-wine-700"
              }
            >
              {group.sido} 전체
            </button>
            {group.subs.map((sub) => {
              const v = regionValue(group.sido, sub);
              const on = sel.includes(v);
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => add(v)}
                  className={
                    on
                      ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
                      : "rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine-500 hover:text-wine-700"
                  }
                >
                  {sub}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
