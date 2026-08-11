"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/Toast";

// VAPID 공개키(base64url) → 구독에 필요한 Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "unsupported" | "loading" | "off" | "on" | "denied";

// 브라우저 푸시 알림 켜기/끄기. 서비스워커 등록 → 권한 요청 → 구독 → 서버 저장.
export function PushToggle() {
  const toast = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const sync = useCallback(async () => {
    if (!supported) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [supported]);

  useEffect(() => {
    sync();
  }, [sync]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast("알림 권한이 필요해요.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string | null }>("/push/public-key");
      if (!publicKey) {
        toast("알림 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState("on");
      toast("브라우저 알림을 켰어요. 새 매칭이 오면 알려드릴게요.");
    } catch (e) {
      toast((e as Error).message || "알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
      toast("브라우저 알림을 껐어요.");
    } catch (e) {
      toast((e as Error).message || "알림을 끄지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-medium text-ink-soft">브라우저 알림</p>
      <p className="mt-0.5 text-xs text-ink-faint">
        새 매칭·매칭 성사 시 이 기기로 알림을 보내드려요. 앱을 열어두지 않아도 받을 수 있어요.
      </p>

      {state === "loading" && <div className="mt-2 h-9 w-32 animate-pulse rounded-xl bg-line/60" />}

      {state === "unsupported" && (
        <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-xs text-ink-faint">
          이 브라우저는 알림을 지원하지 않아요. (iPhone은 Safari에서 &lsquo;홈 화면에 추가&rsquo; 후 사용 가능)
        </p>
      )}

      {state === "denied" && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          알림이 차단돼 있어요. 브라우저 주소창의 자물쇠 아이콘에서 알림을 &lsquo;허용&rsquo;으로 바꿔주세요.
        </p>
      )}

      {state === "off" && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-2 rounded-xl bg-wine-600 px-4 py-2 text-sm font-semibold text-paper transition hover:bg-wine-700 disabled:opacity-40"
        >
          {busy ? "켜는 중..." : "알림 켜기"}
        </button>
      )}

      {state === "on" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            알림 켜짐 ✓
          </span>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await api("/push/test", { method: "POST" });
                toast("테스트 알림을 보냈어요. 잠시 후 알림을 확인해보세요.");
              } catch (e) {
                toast((e as Error).message || "테스트에 실패했어요.");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs text-ink-soft transition hover:bg-cream disabled:opacity-40"
          >
            테스트 알림
          </button>
          <button onClick={disable} disabled={busy} className="text-xs text-ink-faint underline-offset-2 hover:underline disabled:opacity-40">
            끄기
          </button>
        </div>
      )}
    </div>
  );
}
