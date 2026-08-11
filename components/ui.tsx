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

// highlight에 든 키워드는 와인색으로 강조(추천 사유: 나와 겹치는/유사한 키워드).
export function KeywordChips({ keywords, highlight = [] }: { keywords: string[]; highlight?: string[] }) {
  const hi = new Set(highlight);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {(keywords || []).map((k, i) =>
        hi.has(k) ? (
          <span key={i} className="rounded-full border border-wine-600 bg-wine-50 px-2.5 py-0.5 text-xs font-semibold text-wine-700">
            {k}
          </span>
        ) : (
          <span key={i} className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-faint">
            {k}
          </span>
        )
      )}
    </span>
  );
}

// 궁합 강도 바(유사도 높을수록 진하게/길게).
export function MatchStrength({ strength }: { strength: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, strength)) * 100);
  const label = strength >= 0.8 ? "매우 잘 맞아요" : strength >= 0.5 ? "잘 맞아요" : "괜찮아요";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-wine-700">궁합 · {label}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-wine-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
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

// 신뢰도 배지 — 기본 50점. 약속 이행(+5)/노쇼(-50)로 변동.
//   ≥60 좋음 / 40~59 보통 / <40 주의. 정확한 숫자 대신 coarse 라벨로 노출.
export function TrustBadge({ score, showScore = false }: { score: number; showScore?: boolean }) {
  const level = score >= 60 ? "good" : score >= 40 ? "ok" : "low";
  const cfg = {
    good: { label: "신뢰도 좋음", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ok: { label: "신뢰도 보통", cls: "bg-cream text-ink-soft border-line" },
    low: { label: "주의 필요", cls: "bg-red-50 text-red-700 border-red-200" },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <span aria-hidden>🛡️</span>
      {cfg.label}
      {showScore && <span className="opacity-70">· {score}점</span>}
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

// 로딩 자리표시(스켈레톤). 회색 블록이 은은하게 깜빡임(animate-pulse).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

// 추천/매칭 카드 로딩용 스켈레톤 카드.
export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
      <Skeleton className="mt-4 h-2 w-full" />
      <div className="mt-3 flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-full rounded-xl" />
    </div>
  );
}

export function CardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
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
