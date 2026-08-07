"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { Avatar, Spinner, Empty } from "@/components/ui";

interface MatchItem {
  id: string;
  state: string;
  my_response: string;
  cycle_date: string;
  respond_deadline: number;
  contact?: string | null;
  common_connector?: string | null;
  counterpart: {
    name: string;
    age: number | null;
    job: string | null;
    photos: string[];
  };
}

interface Meeting {
  id: string;
  started_at: number;
  i_responded: boolean;
  partner_responded: boolean;
  partner: { name: string; photos: string[] };
}

export function Matches() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [closeReasons, setCloseReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactInput, setContactInput] = useState<Record<string, string>>({});
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [fbReason, setFbReason] = useState("");
  const [fbNoShow, setFbNoShow] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [m, mt] = await Promise.all([
        api<{ matches: MatchItem[] }>("/matches"),
        api<{ meeting: Meeting | null; close_reasons: string[] }>("/me/meeting"),
      ]);
      setMatches(m.matches);
      setMeeting(mt.meeting);
      setCloseReasons(mt.close_reasons);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id: string, action: "accept" | "reject") => {
    try {
      const data = await api<{ state: string }>(`/matches/${id}/respond`, {
        method: "POST",
        body: JSON.stringify({ action, contact: contactInput[id] }),
      });
      toast(data.state === "accepted" ? "매칭 성사! 연락처를 확인하세요 💝" : "응답했어요.");
      await refresh();
      load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  const submitFeedback = async (payload: Record<string, unknown>) => {
    try {
      const data = await api<{ resolved: boolean; status: string }>("/me/meeting/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data.status === "paused") toast("교제 시작을 축하해요! 💞 두 분 모두 휴면 전환됩니다.");
      else if (data.resolved) toast("만남이 종료됐어요. 새로운 추천이 다시 열려요.");
      else toast("응답했어요. 상대의 선택을 기다려주세요.");
      setShowCloseForm(false);
      await refresh();
      load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h2 className="mb-4 text-lg font-bold text-slate-900">매칭함</h2>

      {meeting && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h3 className="font-semibold text-rose-800">
            💞 진행 중인 만남 ({Math.max(0, Math.floor((now - meeting.started_at) / 86400e3))}일차)
          </h3>
          <p className="mt-1 text-sm text-rose-700">
            <strong>{meeting.partner.name}</strong>님과 만나는 중이에요.
            {meeting.partner_responded && !meeting.i_responded && " 상대는 이미 선택했어요."}
          </p>
          {meeting.i_responded ? (
            <p className="mt-2 text-sm text-rose-500">
              응답했어요. {meeting.partner_responded ? "" : "상대의 선택을 기다리는 중…"}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {showCloseForm ? (
                <div className="space-y-2 rounded-xl bg-white p-3">
                  <label className="block text-sm text-slate-700">
                    종료 사유 (선택)
                    <select
                      value={fbReason}
                      onChange={(e) => setFbReason(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {closeReasons.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={fbNoShow} onChange={(e) => setFbNoShow(e.target.checked)} />
                    상대가 약속에 나오지 않았어요 (노쇼)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitFeedback({ decision: "close", reason_category: fbReason, no_show: fbNoShow })}
                      className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white"
                    >
                      종료 확정
                    </button>
                    <button
                      onClick={() => setShowCloseForm(false)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => submitFeedback({ decision: "continue" })}
                    className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 py-2 text-sm font-semibold text-white"
                  >
                    교제 시작 💞
                  </button>
                  <button
                    onClick={() => setShowCloseForm(true)}
                    className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600"
                  >
                    만남 종료
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {matches.length === 0 ? (
        <Empty>아직 매칭이 없어요. 매일 밤 8시에 확인해보세요.</Empty>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const c = m.counterpart;
            const left = Math.max(0, m.respond_deadline - now);
            const hours = Math.floor(left / 3600e3);
            const mins = Math.floor((left % 3600e3) / 60e3);
            return (
              <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{c.name}</span>
                      {m.state === "pending" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          {m.my_response === "accept" ? "응답 완료" : "수락 대기"}
                        </span>
                      )}
                      {m.state === "accepted" && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">매칭 성사</span>
                      )}
                      {m.state !== "pending" && m.state !== "accepted" && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">종료됨</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.age ?? "?"}세 · {c.job ?? ""}
                    </p>
                  </div>
                </div>

                {c.photos.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {c.photos.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={p} alt="" className="h-28 w-28 rounded-xl object-cover" />
                    ))}
                  </div>
                )}

                <div className="mt-3">
                  {m.state === "pending" &&
                    (m.my_response === "accept" ? (
                      <p className="text-sm text-slate-500">
                        수락했어요. 상대의 응답을 기다리는 중… ({hours}시간 {mins}분 남음)
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-500">응답 마감까지 {hours}시간 {mins}분</p>
                        {!contactInput[m.id] && (
                          <input
                            value={contactInput[m.id] ?? ""}
                            onChange={(e) => setContactInput((s) => ({ ...s, [m.id]: e.target.value }))}
                            placeholder="연락처 (카톡ID 또는 전화번호)"
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => respond(m.id, "accept")}
                            className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 py-2 text-sm font-semibold text-white"
                          >
                            수락 💝
                          </button>
                          <button
                            onClick={() => respond(m.id, "reject")}
                            className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600"
                          >
                            거절
                          </button>
                        </div>
                      </div>
                    ))}
                  {m.state === "accepted" && (
                    <div className="space-y-1">
                      <p className="text-sm text-slate-700">
                        💞 연락처가 공개됐어요: <strong>{m.contact || "-"}</strong>
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.common_connector
                          ? `두 분은 ${m.common_connector}님을 통해 연결된 사이예요.`
                          : "연결 경로가 긴 사이예요."}{" "}
                        만남이 진행되는 동안 새로운 추천은 멈춰요.
                      </p>
                    </div>
                  )}
                  {m.state !== "pending" && m.state !== "accepted" && (
                    <p className="text-sm text-slate-500">
                      {m.state === "rejected" ? "거절로 종료됐어요." : "응답 시간이 지나 종료됐어요."}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
