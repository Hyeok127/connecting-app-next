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
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  match_pending: "bg-amber-50 text-amber-700 border-amber-200",
  dating: "bg-rose-50 text-rose-700 border-rose-200",
  paused: "bg-slate-100 text-slate-600 border-slate-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
};

export function Avatar({ name, size = "md" }: { name?: string; size?: "md" | "lg" | "sm" }) {
  const cls =
    size === "lg" ? "w-14 h-14 text-xl" : size === "sm" ? "w-8 h-8 text-sm" : "w-11 h-11 text-lg";
  return (
    <div
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 font-bold text-white`}
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
          className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600"
        >
          {k}
        </span>
      ))}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-slate-500">{children}</p>;
}
