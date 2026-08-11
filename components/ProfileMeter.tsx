"use client";
import type { User } from "@/lib/types";

// 프로필 완성도 계산. 각 항목 채우면 추천 정확도가 올라간다는 넛지.
export interface CompletionItem {
  key: string;
  label: string;
  done: boolean;
}

export function completionItems(
  user: User | null,
  opts: { email?: string; hasValuePrefs?: boolean } = {}
): CompletionItem[] {
  const v = user?.values ?? {};
  return [
    { key: "basic", label: "성별·나이", done: !!user?.gender && !!user?.age },
    { key: "job", label: "직업", done: !!user?.job },
    { key: "region", label: "사는 곳", done: !!user?.region },
    { key: "mbti", label: "MBTI", done: !!user?.mbti },
    { key: "keywords", label: "관심 키워드", done: (user?.keywords?.length ?? 0) >= 1 },
    { key: "values", label: "가치관", done: Object.values(v).some(Boolean) },
    { key: "photos", label: "사진", done: (user?.photos?.length ?? 0) >= 1 },
    { key: "prefs", label: "바라는 가치관", done: !!opts.hasValuePrefs },
    { key: "email", label: "알림 이메일", done: !!opts.email },
  ];
}

export function completionPercent(items: CompletionItem[]): number {
  if (!items.length) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

// 프로필 페이지 상단용 — 완성도 바 + 미완료 항목 체크리스트.
export function ProfileMeter({
  user,
  email,
  hasValuePrefs,
}: {
  user: User | null;
  email?: string;
  hasValuePrefs?: boolean;
}) {
  const items = completionItems(user, { email, hasValuePrefs });
  const pct = completionPercent(items);
  const missing = items.filter((i) => !i.done);

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-ink">프로필 완성도</h3>
        <span className={`font-display text-lg font-bold ${pct === 100 ? "text-emerald-600" : "text-wine-700"}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-wine-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {missing.length > 0 ? (
        <>
          <p className="mt-3 text-xs text-ink-faint">채우면 추천이 더 정확해져요. 남은 항목:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <span key={m.key} className="rounded-full border border-gold-200 bg-gold-100/40 px-2.5 py-0.5 text-xs font-medium text-gold-700">
                + {m.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-emerald-600">프로필을 모두 채웠어요. 좋은 인연을 만날 준비가 됐어요!</p>
      )}
    </div>
  );
}

// 홈 상단용 — 완성도가 낮을 때만 뜨는 간단한 넛지 배너.
export function CompletionNudge({ user, onGo }: { user: User | null; onGo: () => void }) {
  const items = completionItems(user);
  const pct = completionPercent(items);
  if (pct >= 100) return null;
  const missing = items.filter((i) => !i.done).slice(0, 3);
  return (
    <button
      onClick={onGo}
      className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-100/30 px-4 py-3 text-left transition hover:bg-gold-100/50"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">프로필을 완성하고 더 잘 맞는 추천을 받아보세요 · {pct}%</p>
        <p className="truncate text-xs text-ink-faint">남은 항목: {missing.map((m) => m.label).join(" · ")}</p>
      </div>
      <span className="shrink-0 rounded-lg bg-wine-600 px-3 py-1.5 text-xs font-semibold text-paper">완성하기</span>
    </button>
  );
}
