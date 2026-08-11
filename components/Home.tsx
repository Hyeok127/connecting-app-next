"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { Avatar, KeywordChips, MatchStrength, Spinner, Empty } from "@/components/ui";

interface Candidate {
  id: string;
  name: string;
  gender: string | null;
  age: number | null;
  job: string | null;
  region: string | null;
  mbti: string | null;
  keywords: string[];
  values?: Record<string, string>;
  match?: {
    strength: number;
    score: number;
    sharedKeywords: string[];
    valueMatches: { label: string; value: string }[];
  };
}

export function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ranking, setRanking] = useState<string[]>([]);
  const [confirmedToday, setConfirmedToday] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [rec, rank] = await Promise.all([
        api<{ candidates: Candidate[] }>("/recommendations"),
        api<{ ranking: { rank: number; target: Candidate }[]; confirmed_today: boolean }>("/ranking"),
      ]);
      setCandidates(rec.candidates);
      setRanking(rank.ranking.map((r) => r.target.id));
      setConfirmedToday(rank.confirmed_today);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const add = (id: string) => {
    if (ranking.length >= 10) return toast("순위는 최대 10명까지예요.");
    setRanking((r) => [...r, id]);
  };
  const remove = (i: number) => setRanking((r) => r.filter((_, idx) => idx !== i));
  const move = (i: number, dir: number) => {
    const j = i + dir;
    if (j < 0 || j >= ranking.length) return;
    setRanking((r) => {
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const confirmRank = async () => {
    try {
      await api("/ranking", { method: "PUT", body: JSON.stringify({ target_ids: ranking }) });
      setConfirmedToday(true);
      toast("오늘의 순위를 확정했어요. 밤 8시에 결과가 나옵니다!");
    } catch (err) {
      toast((err as Error).message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {user?.status === "dating" && (
        <div className="mb-6 rounded-2xl border border-wine-100 bg-wine-50 p-4 text-sm text-wine-700">
          만남이 진행 중입니다. 만남이 끝나면 추천이 다시 열려요.
        </div>
      )}

      <section>
        <h2 className="mb-1 font-display text-xl font-bold tracking-tight text-ink">오늘의 추천</h2>
        <p className="mb-5 text-[13px] text-ink-faint">
          매일 밤 8시에 순위가 확정돼요. 상호 3순위 안에 들면 매칭됩니다.
        </p>
        {candidates.length === 0 ? (
          <Empty>오늘 추천할 인연이 없어요. 선호 조건을 조정해보세요.</Empty>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => {
              const inRank = ranking.includes(c.id);
              return (
                <div key={c.id} className="rise-in rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display font-semibold text-ink">{c.name}</span>
                        <span className="text-xs text-ink-faint">
                          {c.age ?? "?"}세 · {c.gender ?? ""}
                        </span>
                      </div>
                      <p className="truncate text-sm text-ink-soft">
                        {c.job ?? ""}
                        {c.job && c.region ? " · " : ""}
                        {c.region ? `사는 곳: ${c.region}` : ""}
                      </p>
                    </div>
                  </div>
                  {c.match && (
                    <div className="mt-3">
                      <MatchStrength strength={c.match.strength} />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {c.mbti && <span className="text-xs font-medium text-gold-600">{c.mbti}</span>}
                    <KeywordChips keywords={c.keywords} highlight={c.match?.sharedKeywords} />
                  </div>
                  {c.match && c.match.valueMatches.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <span className="text-xs text-ink-faint">내가 바라던</span>
                      {c.match.valueMatches.map((v) => (
                        <span key={v.label} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {v.label} {v.value}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    disabled={inRank}
                    onClick={() => add(c.id)}
                    className="mt-4 w-full rounded-xl border border-wine-100 bg-wine-50 py-2 text-sm font-medium text-wine-700 transition hover:bg-wine-100 disabled:opacity-50"
                  >
                    {inRank ? "순위에 있음 ✓" : "순위에 추가"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-1 font-display text-xl font-bold tracking-tight text-ink">내 순위</h2>
        <p className="mb-5 text-[13px] text-ink-faint">
          {confirmedToday ? "오늘 확정 완료 — 내일 다시 정할 수 있어요." : "순서를 정한 뒤 확정해주세요."}
        </p>
        {ranking.length === 0 ? (
          <Empty>추천에서 순위에 추가할 인연을 골라보세요.</Empty>
        ) : (
          <div className="space-y-2">
            {ranking.map((id, i) => {
              const c = candidates.find((x) => x.id === id);
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-sm ${
                    i === 0 ? "border-gold-100 ring-1 ring-gold-100" : "border-line"
                  }`}
                >
                  <span className="w-7 text-center font-display text-lg font-bold text-wine-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{c?.name}</div>
                    <div className="text-xs text-ink-faint">{c?.job}</div>
                  </div>
                  {!confirmedToday && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="rounded-lg border border-line bg-cream px-2 py-1 text-sm text-ink-soft disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === ranking.length - 1}
                        className="rounded-lg border border-line bg-cream px-2 py-1 text-sm text-ink-soft disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => remove(i)}
                        className="rounded-lg border border-line bg-cream px-2 py-1 text-sm text-ink-soft"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          disabled={confirmedToday || ranking.length === 0}
          onClick={confirmRank}
          className="mt-5 w-full rounded-xl bg-wine-600 py-2.5 text-sm font-semibold text-paper transition hover:bg-wine-700 disabled:opacity-40"
        >
          순위 확정
        </button>
      </section>
    </div>
  );
}
