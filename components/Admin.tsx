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

export function Admin() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: AdminUser[] }>("/admin/users");
      setUsers(data.users);
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">관리자 — 전체 회원</h2>
        <button
          onClick={runBatch}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          수동 배치 실행
        </button>
      </div>
      {users.length === 0 ? (
        <Empty>회원이 없습니다.</Empty>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Avatar name={u.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong className="text-slate-900">{u.name}</strong>
                  <Badge status={u.status} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
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
