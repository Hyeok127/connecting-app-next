"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

const REASONS = ["부적절한 프로필", "부적절한 사진", "불쾌한 대화", "사칭 의심", "기타"];

// 상대 신고(사유 선택)·차단. 신고하면 자동으로 차단도 걸려 추천에서 제외됨.
export function ReportBlock({ targetId, onDone }: { targetId: string; onDone?: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (kind: "report" | "block", reason?: string) => {
    setBusy(true);
    try {
      await api("/moderation", { method: "POST", body: JSON.stringify({ target_id: targetId, kind, reason }) });
      toast(kind === "block" ? "차단했어요. 추천에서 제외됩니다." : "신고했어요. 확인 후 조치할게요.");
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-ink-faint transition hover:text-wine-700">
        신고·차단
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-white p-2 shadow-lg">
          <p className="px-1 pb-1 text-xs text-ink-faint">신고 사유</p>
          {REASONS.map((r) => (
            <button key={r} disabled={busy} onClick={() => act("report", r)} className="block w-full rounded px-2 py-1 text-left text-xs text-ink-soft transition hover:bg-cream disabled:opacity-40">
              {r}
            </button>
          ))}
          <button disabled={busy} onClick={() => act("block")} className="mt-1 block w-full rounded bg-wine-50 px-2 py-1 text-left text-xs font-medium text-wine-700 disabled:opacity-40">
            차단만 하기
          </button>
        </div>
      )}
    </div>
  );
}
