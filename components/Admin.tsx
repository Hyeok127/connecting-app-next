"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { Avatar, Badge, KeywordChips, ValueChips, TrustBadge, Spinner, Empty } from "@/components/ui";

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
  const [tab, setTab] = useState<"users" | "matches">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, r, h, m] = await Promise.all([
        api<{ users: AdminUser[] }>("/admin/users"),
        api<{ reports: AdminReport[] }>("/admin/reports"),
        api<Health>("/health").catch(() => null),
        api<MatchData>("/admin/matches").catch(() => null),
      ]);
      setUsers(u.users);
      setReports(r.reports);
      setHealth(h);
      setMatchData(m);
    } finally {
      setLoading(false);
    }
  }, []);

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">관리자</h2>
        <button onClick={runBatch} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/85">
          수동 배치 실행
        </button>
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
        {(["users", "matches"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 text-sm font-medium transition ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"}`}
          >
            {t === "users" ? `회원 (${users.length})` : `매칭 현황 (${matchData?.summary.total ?? 0})`}
          </button>
        ))}
      </div>

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
