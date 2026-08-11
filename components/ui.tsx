// components/ui.tsx — 공용 UI 요소
"use client";

const STATUS_LABEL: Record<string, string> = {
  active: "활동",
  match_pending: "매칭 대기",
  dating: "만남 중",
  paused: "휴면(교제)",
  suspended: "정지",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  match_pending: "bg-gold-100 text-gold-600 border-gold-100",
  dating: "bg-wine-50 text-wine-700 border-wine-100",
  paused: "bg-cream text-ink-soft border-line",
  suspended: "bg-red-50 text-red-700 border-red-200",
};

export function Avatar({ name, size = "md" }: { name?: string; size?: "md" | "lg" | "sm" }) {
  const cls =
    size === "lg" ? "w-14 h-14 text-xl" : size === "sm" ? "w-8 h-8 text-sm" : "w-11 h-11 text-lg";
  return (
    <div
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-wine-700 font-display font-semibold text-paper ring-1 ring-wine-900/20`}
    >
      {String(name || "?")[0]}
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || STATUS_STYLE.active}`}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function KeywordChips({ keywords }: { keywords: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {(keywords || []).map((k, i) => (
        <span
          key={i}
          className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-soft"
        >
          {k}
        </span>
      ))}
    </span>
  );
}

const VALUE_LABEL: Record<string, string> = {
  smoke: "흡연",
  drink: "음주",
  tattoo: "문신",
  religion: "종교",
};

// 가치관 설문 값(흡연/음주/문신/종교)을 작은 라벨 칩으로 표시.
export function ValueChips({ values }: { values?: Record<string, string> }) {
  const entries = Object.entries(values || {}).filter(([, v]) => v);
  if (entries.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="rounded-full border border-line bg-white px-2 py-0.5 text-xs text-ink-soft"
        >
          <span className="text-ink-faint">{VALUE_LABEL[k] ?? k} </span>
          {v}
        </span>
      ))}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-wine-100 border-t-wine-600" />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-6 py-8 text-center text-sm text-ink-faint">
      {children}
    </div>
  );
}
