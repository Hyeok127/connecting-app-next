"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { Avatar, Badge, KeywordChips, ValueChips, TrustBadge, Spinner, Empty } from "@/components/ui";

interface Snapshot {
  taken_at: number;
  cycle: string;
  label: string;
  members: number;
  total_matches: number;
  accepted: number;
  couples: number;
  active_meetings: number;
  pending_pairs: number;
}

interface AdminUser {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  age: number | null;
  job_type: string | null;
  job_role: string | null;
  region: string | null;
  mbti: string | null;
  status: string;
  trust_score: number;
  invite_code: string;
  is_admin: boolean;
  inviter_name: string | null;
  points: number;
  created_at: number;
  keywords: string[];
  values: Record<string, string>;
  photo_count: number;
  email: string | null;
  contact: string | null;
  consent_version: string | null;
  prefs: {
    genders: string[];
    age_min: number | null;
    age_max: number | null;
    job_types: string[];
    job_roles: string[];
    regions: string[];
    value_prefs: Record<string, string[]>;
  } | null;
}

interface AdminReport {
  reporter_name: string;
  target_id: string | null;
  target_name: string;
  reason: string;
  created_at: number;
  target_report_count: number;
}

interface Health {
  cycle: string;
  active_users: number;
  matches_today: number;
  last_match_cycle: string | null;
  batch_stale: boolean;
}

interface AdminMatch {
  id: string;
  cycle_date: string;
  a_name: string;
  b_name: string;
  state: string;
  a_response: string;
  b_response: string;
  score: number;
  respond_deadline: number;
  created_at: number;
  meeting_status: string | null;
}

interface MatchData {
  matches: AdminMatch[];
  summary: { pending: number; accepted: number; rejected: number; expired: number; active_meetings: number; total: number };
}

interface Dashboard {
  cycle: string;
  participants: {
    members: number;
    bridges: number;
    by_status: Record<string, number>;
    by_gender: Record<string, number>;
    with_photos: number;
    with_prefs: number;
    with_email: number;
  };
  today: {
    cycle: string;
    confirmed_rankers: number;
    rankable_pool: number;
    pending_batch_pairs: number;
    matches: number;
    matches_by_state: Record<string, number>;
  };
  matching: {
    total_matches: number;
    by_state: Record<string, number>;
    active_meetings: number;
    closed_meetings: number;
    dating_users: number;
    paused_users: number;
  };
  funnel: { rankers: number; matches: number; accepted: number; meetings: number; couples: number };
  bridges: { name: string; invited: number; points: number }[];
}

const STATE_LABEL: Record<string, string> = { pending: "대기", accepted: "성사", rejected: "거절", expired: "만료" };
const STATE_STYLE: Record<string, string> = {
  pending: "bg-gold-100/60 text-gold-600 border-gold-100",
  accepted: "bg-wine-50 text-wine-700 border-wine-100",
  rejected: "bg-cream text-ink-faint border-line",
  expired: "bg-cream text-ink-faint border-line",
};
const RESP: Record<string, string> = { pending: "…", accept: "✓", reject: "✕" };

export function Admin() {
  const toast = useToast();
  const { logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "trend" | "users" | "matches">("dashboard");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [snapBusy, setSnapBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, r, h, m, d, s] = await Promise.all([
        api<{ users: AdminUser[] }>("/admin/users"),
        api<{ reports: AdminReport[] }>("/admin/reports"),
        api<Health>("/health").catch(() => null),
        api<MatchData>("/admin/matches").catch(() => null),
        api<{ dashboard: Dashboard }>("/admin/dashboard").then((x) => x.dashboard).catch(() => null),
        api<{ snapshots: Snapshot[] }>("/admin/snapshot").then((x) => x.snapshots).catch(() => []),
      ]);
      setUsers(u.users);
      setReports(r.reports);
      setHealth(h);
      setMatchData(m);
      setDash(d);
      setSnaps(s);
    } finally {
      setLoading(false);
    }
  }, []);

  const takeSnapshot = async () => {
    setSnapBusy(true);
    try {
      await api("/admin/snapshot", { method: "POST" });
      toast("스냅샷을 기록했어요.");
      load().catch(() => {});
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSnapBusy(false);
    }
  };

  const showErr = useCallback((e: unknown) => toast((e as Error).message), [toast]);

  useEffect(() => {
    load().catch(showErr);
  }, [load, showErr]);

  const setStatus = async (id: string, status: string) => {
    if (status === "suspended" && !confirm("정말 이 회원을 정지할까요?")) return;
    try {
      await api(`/admin/users/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      toast(status === "suspended" ? "정지했습니다." : "정지를 해제했습니다.");
      load().catch(showErr);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const runBatch = async () => {
    try {
      const r = await api<{ result: string }>("/admin/run-batch", { method: "POST" });
      toast(r.result);
      load().catch(showErr);
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) return <Spinner />;

  const memberCount = users.filter((u) => u.role === "member").length;

  return (
    <div className="min-h-screen bg-cream/30">
      {/* 운영 콘솔 자체 헤더 */}
      <div className="sticky top-0 z-40 border-b border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="font-display text-sm font-bold tracking-wide">⚙ 운영 콘솔</span>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/home")} className="rounded-full border border-paper/30 px-3 py-1 text-xs text-paper/90 transition hover:bg-paper/10">
              앱으로
            </button>
            <button onClick={async () => { await logout(); router.push("/"); }} className="rounded-full border border-paper/30 px-3 py-1 text-xs text-paper/90 transition hover:bg-paper/10">
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">모니터링</h2>
        <div className="flex gap-2">
          <button onClick={takeSnapshot} disabled={snapBusy} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-cream disabled:opacity-40">
            {snapBusy ? "기록 중..." : "스냅샷 찍기"}
          </button>
          <button onClick={runBatch} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/85">
            수동 배치 실행
          </button>
        </div>
      </div>

      {/* 배치/상태 요약 */}
      {health && (
        <div className={`mb-4 rounded-2xl border p-4 ${health.batch_stale ? "border-gold-200 bg-gold-100/40" : "border-line bg-white"}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-display font-semibold text-ink">배치 상태</span>
            <span className="text-ink-soft">
              오늘({health.cycle}) 매칭 <strong className="text-ink">{health.matches_today}</strong>건
            </span>
            <span className="text-ink-faint">활동 회원 {health.active_users}명</span>
            <span className="text-ink-faint">마지막 매칭 사이클 {health.last_match_cycle ?? "없음"}</span>
          </div>
          {health.batch_stale && (
            <p className="mt-1.5 text-xs text-gold-700">오늘 생성된 매칭이 없습니다. 밤 8시 이전이면 정상이고, 이후에도 0이면 배치를 확인하세요.</p>
          )}
        </div>
      )}

      {reports.length > 0 && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
          <h3 className="mb-2 font-display font-semibold text-red-700">신고 접수 ({reports.length}건)</h3>
          <div className="space-y-1.5">
            {reports.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                <strong className="text-ink">{r.target_name}</strong>
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">{r.reason}</span>
                {r.target_report_count > 1 && <span className="rounded-full bg-red-600 px-2 py-0.5 font-medium text-white">누적 {r.target_report_count}회</span>}
                <span className="text-ink-faint">신고자 {r.reporter_name} · {new Date(r.created_at).toLocaleDateString("ko-KR")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="mb-4 flex gap-1 rounded-full bg-cream p-1">
        {(["dashboard", "trend", "users", "matches"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"}`}
          >
            {t === "dashboard" ? "대시보드" : t === "trend" ? `변화 추이 (${snaps.length})` : t === "users" ? `회원 (${users.length})` : `매칭 (${matchData?.summary.total ?? 0})`}
          </button>
        ))}
      </div>

      {tab === "dashboard" && dash && <DashboardPanel d={dash} />}
      {tab === "dashboard" && !dash && <Empty>대시보드를 불러오지 못했습니다.</Empty>}
      {tab === "trend" && <TrendPanel snaps={snaps} />}

      {tab === "users" && (
        <>
          <p className="mb-3 text-xs text-ink-faint">일반 {memberCount}명 · 전체 {users.length}명 · 이름을 눌러 프로필 상세를 펼쳐보세요.</p>
          {users.length === 0 ? (
            <Empty>회원이 없습니다.</Empty>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const open = expanded.has(u.id);
                return (
                  <div key={u.id} className="rounded-2xl border border-line bg-white shadow-sm">
                    <button onClick={() => toggle(u.id)} className="flex w-full items-start gap-3 p-4 text-left">
                      <Avatar name={u.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-ink">{u.name}</strong>
                          <Badge status={u.status} />
                          {u.role === "member" && <TrustBadge score={u.trust_score} always />}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                          {u.role === "member" ? "일반" : "주선자"}
                          {u.is_admin && " · 관리자"}
                          {u.gender && ` · ${u.gender} ${u.age ?? "?"}세`}
                          {(u.job_type || u.job_role) && ` · ${[u.job_type, u.job_role].filter(Boolean).join(" ")}`}
                          {u.region && ` · ${u.region}`}
                          <br />
                          초대자 {u.inviter_name || "(루트)"} · 포인트 {u.points} · 코드 {u.invite_code} · {new Date(u.created_at).toLocaleDateString("ko-KR")} 가입
                        </p>
                      </div>
                      <span className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
                    </button>

                    {open && (
                      <div className="space-y-3 border-t border-line px-4 py-3 text-sm">
                        {u.role === "member" ? (
                          <>
                            <Row label="키워드">{u.keywords.length ? <KeywordChips keywords={u.keywords} /> : <Muted />}</Row>
                            <Row label="가치관">{Object.keys(u.values).length ? <ValueChips values={u.values} /> : <Muted />}</Row>
                            <Row label="바라는 상대">
                              {u.prefs ? (
                                <span className="text-xs text-ink-soft">
                                  {u.prefs.genders.length ? u.prefs.genders.join("·") : "성별 무관"}
                                  {(u.prefs.age_min || u.prefs.age_max) && ` · ${u.prefs.age_min ?? ""}~${u.prefs.age_max ?? ""}세`}
                                  {u.prefs.job_types.length ? ` · 직장 ${u.prefs.job_types.join(",")}` : ""}
                                  {u.prefs.job_roles.length ? ` · 직무 ${u.prefs.job_roles.join(",")}` : ""}
                                  {u.prefs.regions.length ? ` · 지역 ${u.prefs.regions.join(",")}` : ""}
                                  {Object.keys(u.prefs.value_prefs).length ? ` · 가치관 ${Object.entries(u.prefs.value_prefs).map(([k, v]) => `${k}:${v.join("/")}`).join(", ")}` : ""}
                                </span>
                              ) : (
                                <Muted>제한 없음</Muted>
                              )}
                            </Row>
                            <Row label="사진">{u.photo_count > 0 ? `${u.photo_count}장 등록` : <Muted />}</Row>
                            <Row label="MBTI">{u.mbti || <Muted />}</Row>
                          </>
                        ) : null}
                        <Row label="알림 이메일">{u.email || <Muted />}</Row>
                        <Row label="연락처">{u.contact || <Muted />}</Row>
                        <Row label="약관 동의">{u.consent_version || <Muted>기록 없음</Muted>}</Row>
                        <Row label="신뢰도">{u.trust_score}점</Row>

                        {!u.is_admin && u.status !== "dating" && (
                          <div className="pt-1">
                            {u.status !== "suspended" ? (
                              <button onClick={() => setStatus(u.id, "suspended")} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600">정지</button>
                            ) : (
                              <button onClick={() => setStatus(u.id, "active")} className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">정지 해제</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "matches" && matchData && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              ["대기", matchData.summary.pending],
              ["성사", matchData.summary.accepted],
              ["거절", matchData.summary.rejected],
              ["만료", matchData.summary.expired],
              ["진행 만남", matchData.summary.active_meetings],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-line bg-white p-3 text-center">
                <div className="font-display text-lg font-bold text-ink">{n}</div>
                <div className="text-xs text-ink-faint">{label}</div>
              </div>
            ))}
          </div>
          {matchData.matches.length === 0 ? (
            <Empty>아직 생성된 매칭이 없습니다. 밤 8시 배치 또는 수동 배치 실행 후 생깁니다.</Empty>
          ) : (
            <div className="space-y-2">
              {matchData.matches.map((m) => (
                <div key={m.id} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-ink">{m.a_name}</span>
                    <span className="text-ink-faint">×</span>
                    <span className="font-medium text-ink">{m.b_name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_STYLE[m.state]}`}>{STATE_LABEL[m.state] ?? m.state}</span>
                    {m.meeting_status === "active" && <span className="rounded-full border border-wine-100 bg-wine-50 px-2 py-0.5 text-xs font-medium text-wine-700">만남 중</span>}
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {m.cycle_date} · 응답 {m.a_name.slice(0, 4)} {RESP[m.a_response]} / {m.b_name.slice(0, 4)} {RESP[m.b_response]} · 점수 {m.score} · {new Date(m.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              ))}
              {matchData.summary.total >= 100 && <p className="pt-1 text-center text-xs text-ink-faint">최근 100건만 표시</p>}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ── 변화 추이(스냅샷) ──
function TrendPanel({ snaps }: { snaps: Snapshot[] }) {
  if (snaps.length === 0)
    return (
      <div>
        <p className="mb-3 text-xs text-ink-faint">아직 스냅샷이 없습니다. 배치가 돌 때 자동 기록되고, 위 &lsquo;스냅샷 찍기&rsquo;로 지금 시점을 남길 수 있어요.</p>
        <Empty>스냅샷을 찍으면 여기에 시점별 변화가 쌓입니다.</Empty>
      </div>
    );

  const metrics: [string, keyof Snapshot, string][] = [
    ["회원", "members", "text-ink"],
    ["총 매칭", "total_matches", "text-wine-700"],
    ["성사", "accepted", "text-emerald-600"],
    ["교제", "couples", "text-gold-600"],
  ];
  const first = snaps[0], last = snaps[snaps.length - 1];
  const delta = (k: keyof Snapshot) => Number(last[k]) - Number(first[k]);

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-faint">시점별 스냅샷 {snaps.length}개 · {new Date(first.taken_at).toLocaleString("ko-KR")} → {new Date(last.taken_at).toLocaleString("ko-KR")}</p>

      {/* 처음→지금 누적 변화 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, key, color]) => (
          <div key={label} className="rounded-xl border border-line bg-white p-3">
            <div className={`font-display text-2xl font-bold ${color}`}>{Number(last[key])}</div>
            <div className="text-xs text-ink-faint">{label}</div>
            <div className={`mt-0.5 text-[11px] ${delta(key) > 0 ? "text-emerald-600" : "text-ink-faint/60"}`}>
              {delta(key) >= 0 ? "+" : ""}{delta(key)} (처음 대비)
            </div>
          </div>
        ))}
      </div>

      {/* 미니 라인(스파크라인 형태) */}
      {metrics.map(([label, key]) => {
        const vals = snaps.map((s) => Number(s[key]));
        const max = Math.max(1, ...vals);
        return (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink-soft">{label}</span>
              <span className="text-xs text-ink-faint">최대 {max}</span>
            </div>
            <div className="flex items-end gap-0.5" style={{ height: 40 }}>
              {vals.map((v, i) => (
                <div key={i} className="flex-1 rounded-t bg-wine-400" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={`${snaps[i].cycle} (${snaps[i].label}): ${v}`} />
              ))}
            </div>
          </div>
        );
      })}

      {/* 스냅샷 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-ink-faint">
              <th className="py-1.5 text-left font-medium">시각</th>
              <th className="text-left font-medium">사이클</th>
              <th className="text-right font-medium">회원</th>
              <th className="text-right font-medium">매칭</th>
              <th className="text-right font-medium">성사</th>
              <th className="text-right font-medium">교제</th>
              <th className="text-right font-medium">예정</th>
            </tr>
          </thead>
          <tbody>
            {[...snaps].reverse().map((s, i) => (
              <tr key={i} className="border-b border-line/50 text-ink-soft">
                <td className="py-1.5">{new Date(s.taken_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} <span className="text-ink-faint/60">{s.label === "auto" ? "자동" : "수동"}</span></td>
                <td>{s.cycle}</td>
                <td className="text-right">{s.members}</td>
                <td className="text-right">{s.total_matches}</td>
                <td className="text-right">{s.accepted}</td>
                <td className="text-right">{s.couples}</td>
                <td className="text-right">{s.pending_pairs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-xs font-medium text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Muted({ children }: { children?: React.ReactNode }) {
  return <span className="text-xs text-ink-faint/60">{children ?? "없음"}</span>;
}

// ── 대시보드 ──
function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-wine-100 bg-wine-50" : "border-line bg-white"}`}>
      <div className={`font-display text-2xl font-bold ${accent ? "text-wine-700" : "text-ink"}`}>{value}</div>
      <div className="text-xs text-ink-faint">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-faint/70">{sub}</div>}
    </div>
  );
}

const STATE_KO: Record<string, string> = { active: "활동", match_pending: "매칭대기", dating: "만남중", paused: "휴면(교제)", suspended: "정지", pending: "대기", accepted: "성사", rejected: "거절", expired: "만료" };

function Chips({ obj }: { obj: Record<string, number> }) {
  const entries = Object.entries(obj);
  if (!entries.length) return <span className="text-xs text-ink-faint/60">없음</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs text-ink-soft">
          {STATE_KO[k] ?? k} <strong className="text-ink">{v}</strong>
        </span>
      ))}
    </div>
  );
}

function DashboardPanel({ d }: { d: Dashboard }) {
  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);
  const f = d.funnel;
  const steps: [string, number, number | null][] = [
    ["순위 확정자", f.rankers, null],
    ["매칭 생성", f.matches, f.rankers],
    ["성사(쌍방수락)", f.accepted, f.matches],
    ["만남 시작", f.meetings, f.accepted],
    ["교제 시작", f.couples, f.meetings],
  ];
  const maxF = Math.max(1, f.rankers, f.matches, f.accepted, f.meetings, f.couples);

  return (
    <div className="space-y-6">
      {/* 참가자 */}
      <section>
        <h3 className="mb-2 font-display font-semibold text-ink">참가자</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="일반 회원" value={d.participants.members} accent />
          <Stat label="주선자" value={d.participants.bridges} />
          <Stat label="사진 등록" value={d.participants.with_photos} sub={`${pct(d.participants.with_photos, d.participants.members)}%`} />
          <Stat label="선호 설정" value={d.participants.with_prefs} sub={`${pct(d.participants.with_prefs, d.participants.members)}%`} />
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          <div className="flex gap-2"><span className="w-14 shrink-0 text-ink-faint">상태</span><Chips obj={d.participants.by_status} /></div>
          <div className="flex gap-2"><span className="w-14 shrink-0 text-ink-faint">성별</span><Chips obj={d.participants.by_gender} /></div>
        </div>
      </section>

      {/* 오늘 추천/배치 예정 */}
      <section>
        <h3 className="mb-1 font-display font-semibold text-ink">오늘의 추천·배치 ({d.today.cycle})</h3>
        <p className="mb-2 text-xs text-ink-faint">밤 8시 배치가 돌면 아래 &lsquo;예정 매칭&rsquo;만큼 매칭이 생깁니다.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="순위 확정자" value={d.today.confirmed_rankers} />
          <Stat label="추천 가능 풀" value={d.today.rankable_pool} sub="active 회원" />
          <Stat label="예정 매칭(쌍)" value={d.today.pending_batch_pairs} accent sub="다음 배치 시" />
          <Stat label="오늘 생성된 매칭" value={d.today.matches} />
        </div>
        {Object.keys(d.today.matches_by_state).length > 0 && (
          <div className="mt-2 flex gap-2 text-xs"><span className="w-14 shrink-0 text-ink-faint">오늘 상태</span><Chips obj={d.today.matches_by_state} /></div>
        )}
      </section>

      {/* 매칭 단계 */}
      <section>
        <h3 className="mb-2 font-display font-semibold text-ink">매칭 단계 (누적)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="총 매칭" value={d.matching.total_matches} />
          <Stat label="진행 중 만남" value={d.matching.active_meetings} accent />
          <Stat label="만남 중(dating)" value={d.matching.dating_users} />
          <Stat label="교제 휴면(paused)" value={d.matching.paused_users} />
        </div>
        <div className="mt-2 flex gap-2 text-xs"><span className="w-14 shrink-0 text-ink-faint">매칭 상태</span><Chips obj={d.matching.by_state} /></div>
      </section>

      {/* 퍼널 */}
      <section>
        <h3 className="mb-1 font-display font-semibold text-ink">전환 퍼널</h3>
        <p className="mb-3 text-xs text-ink-faint">각 단계로 얼마나 넘어가는지 — 추천·매칭 개선의 기준 지표.</p>
        <div className="space-y-2">
          {steps.map(([label, n, base]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-ink-soft">{label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-cream">
                <div className="flex h-full items-center justify-end rounded bg-wine-500 px-2 text-[11px] font-medium text-paper" style={{ width: `${Math.max(6, (n / maxF) * 100)}%` }}>
                  {n}
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-xs text-ink-faint">{base != null ? `${pct(n, base)}%` : ""}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 주선자 */}
      <section>
        <h3 className="mb-2 font-display font-semibold text-ink">주선자 현황</h3>
        {d.bridges.length === 0 ? (
          <Empty>주선자가 없습니다.</Empty>
        ) : (
          <div className="space-y-1.5">
            {d.bridges.map((b) => (
              <div key={b.name} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2 text-sm">
                <strong className="text-ink">{b.name}</strong>
                <span className="text-xs text-ink-faint">초대 {b.invited}명 · 포인트 {b.points}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
