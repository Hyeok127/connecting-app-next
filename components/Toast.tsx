"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
          <div className="max-w-md rounded-full bg-ink/95 px-5 py-2.5 text-sm font-medium text-paper shadow-lg">
            {msg}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
