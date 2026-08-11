"use client";
import { useMemo, useState } from "react";
import { KEYWORD_CATALOG, MAX_KEYWORDS } from "@/lib/keywords";

// 카테고리별 칩 선택(검색 + 아코디언). 선택값은 name 필드의 hidden input으로 내보내 FormData.getAll(name)로 수집된다.
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
  const [query, setQuery] = useState("");
  // 첫 카테고리만 펼친 채로 시작 — 148개를 한 번에 쏟아내지 않는다.
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set([KEYWORD_CATALOG[0]?.key]));

  const toggle = (kw: string) => {
    setSelected((prev) => {
      if (prev.includes(kw)) return prev.filter((k) => k !== kw);
      if (prev.length >= max) return prev; // 상한 도달 시 무시
      return [...prev, kw];
    });
  };

  const toggleCat = (key: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const q = query.trim().toLowerCase();
  // 검색 결과(전체 카테고리 평탄화). 검색 중이면 아코디언 대신 이 목록을 보여준다.
  const searchHits = useMemo(() => {
    if (!q) return [];
    const hits: string[] = [];
    for (const cat of KEYWORD_CATALOG)
      for (const kw of cat.items) if (kw.toLowerCase().includes(q)) hits.push(kw);
    return hits;
  }, [q]);

  const chipCls = (on: boolean, full: boolean) =>
    on
      ? "rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
      : `rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:border-wine-500 hover:text-wine-700 ${full ? "opacity-40" : ""}`;

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

      {/* 선택한 키워드 요약(클릭하면 해제) */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className="rounded-full border border-wine-600 bg-wine-600 px-2.5 py-1 text-xs font-medium text-paper"
            >
              {k} ✕
            </button>
          ))}
        </div>
      )}

      {/* 검색 */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="키워드 검색 (예: 여행, 운동)"
        className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-wine-500 focus:ring-2 focus:ring-wine-100"
      />

      {q ? (
        <div className="mt-2 rounded-xl border border-line bg-cream/40 p-3">
          {searchHits.length === 0 ? (
            <p className="text-xs text-ink-faint">‘{query}’에 맞는 키워드가 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {searchHits.map((kw) => {
                const on = selected.includes(kw);
                const full = !on && selected.length >= max;
                return (
                  <button key={kw} type="button" onClick={() => toggle(kw)} disabled={full} className={chipCls(on, full)}>
                    {kw}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {KEYWORD_CATALOG.map((cat) => {
            const open = openCats.has(cat.key);
            const catCount = cat.items.filter((k) => selected.includes(k)).length;
            return (
              <div key={cat.key} className="overflow-hidden rounded-xl border border-line bg-white">
                <button
                  type="button"
                  onClick={() => toggleCat(cat.key)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-cream/60"
                >
                  <span className="text-xs font-semibold text-ink-soft">
                    {cat.label}
                    {catCount > 0 && <span className="ml-1.5 text-wine-600">· {catCount}</span>}
                  </span>
                  <span className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line bg-cream/30 p-3">
                    {cat.items.map((kw) => {
                      const on = selected.includes(kw);
                      const full = !on && selected.length >= max;
                      return (
                        <button key={kw} type="button" onClick={() => toggle(kw)} disabled={full} className={chipCls(on, full)}>
                          {kw}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
