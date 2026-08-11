"use client";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { Avatar, Badge, Spinner, Empty } from "@/components/ui";

interface AdminUser {
  id: string;
  name: string;
  role: string;
  gender: string | null;
  age: number | null;
  job: string | null;
  region: string | null;
  status: string;
  trust_score: number;
  invite_code: string;
  is_admin: boolean;
  inviter_name: string | null;
  points: number;
  created_at: number;
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

export function Admin() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, r, h] = await Promise.all([
        api<{ users: AdminUser[] }>("/admin/users"),
        api<{ reports: AdminReport[] }>("/admin/reports"),
        api<Health>("/health").catch(() => null),
      ]);
      setUsers(u.users);
      setReports(r.reports);
      setHealth(h);
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

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">관리자 — 전체 회원</h2>
        <button
          onClick={runBatch}
          className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/85"
        >
          수동 배치 실행
        </button>
      </div>

      {health && (
        <div className={`mb-6 rounded-2xl border p-4 ${health.batch_stale ? "border-gold-200 bg-gold-100/40" : "border-line bg-white"}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-display font-semibold text-ink">배치 상태</span>
            <span className="text-ink-soft">
              오늘({health.cycle}) 매칭 <strong className="text-ink">{health.matches_today}</strong>건
            </span>
            <span className="text-ink-faint">활동 회원 {health.active_users}명</span>
            <span className="text-ink-faint">마지막 매칭 사이클 {health.last_match_cycle ?? "없음"}</span>
          </div>
          {health.batch_stale && (
            <p className="mt-1.5 text-xs text-gold-700">
              오늘 생성된 매칭이 없습니다. 밤 8시 이전이면 정상이고, 이후에도 0이면 배치를 확인하세요.
            </p>
          )}
        </div>
      )}

      {reports.length > 0 && (
        <div className="mb-6 rounded-2xl border border-red-100 bg-red-50/50 p-4">
          <h3 className="mb-2 font-display font-semibold text-red-700">신고 접수 ({reports.length}건)</h3>
          <div className="space-y-1.5">
            {reports.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                <strong className="text-ink">{r.target_name}</strong>
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">{r.reason}</span>
                {r.target_report_count > 1 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 font-medium text-white">누적 {r.target_report_count}회</span>
                )}
                <span className="text-ink-faint">
                  신고자 {r.reporter_name} · {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <Empty>회원이 없습니다.</Empty>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
              <Avatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong className="text-ink">{u.name}</strong>
                  <Badge status={u.status} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                  {u.role === "member" ? "일반" : "주선자"}
                  {u.is_admin && " · 관리자"}
                  {u.gender && ` · ${u.gender} ${u.age ?? "?"}세`}
                  {u.job && ` · ${u.job}`}
                  {u.region && ` · ${u.region}`}
                  <br />
                  초대자: {u.inviter_name || "(루트)"} · 신뢰 {u.trust_score}점 · 포인트 {u.points}점 ·
                  코드 {u.invite_code} · {new Date(u.created_at).toLocaleDateString("ko-KR")} 가입
                </p>
                {!u.is_admin && u.status !== "dating" && (
                  <div className="mt-2">
                    {u.status !== "suspended" ? (
                      <button
                        onClick={() => setStatus(u.id, "suspended")}
                        className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600"
                      >
                        정지
                      </button>
                    ) : (
                      <button
                        onClick={() => setStatus(u.id, "active")}
                        className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600"
                      >
                        정지 해제
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
