"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [actionable, setActionable] = useState(0); // 내 응답 대기 중인 매칭 수
  const [hasNew, setHasNew] = useState(false); // 아직 안 본 새 매칭 존재 여부

  const isMember = user?.role === "member";

  // 매칭함 배지용 알림 집계. 페이지 이동/창 포커스 때마다 갱신.
  const loadNotifs = useCallback(async () => {
    if (!isMember) return;
    try {
      const r = await api<{ actionable: number; matchIds: string[] }>("/me/notifications");
      setActionable(r.actionable);
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem("seen_match_ids") || "[]");
      } catch {
        seen = [];
      }
      const seenSet = new Set(seen);
      setHasNew(r.matchIds.some((id) => !seenSet.has(id)));
    } catch {
      /* 배지는 보조 기능 — 실패해도 무시 */
    }
  }, [isMember]);

  useEffect(() => {
    loadNotifs();
  }, [loadNotifs, pathname]);

  useEffect(() => {
    const refresh = () => loadNotifs();
    window.addEventListener("focus", refresh);
    window.addEventListener("notifs:refresh", refresh); // 매칭함에서 응답/로드 후 즉시 갱신
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("notifs:refresh", refresh);
    };
  }, [loadNotifs]);

  const nav = useCallback(
    (label: string, href: string, badge?: { count?: number; dot?: boolean }) => {
      const active = pathname === href;
      return (
        <Link
          key={href}
          href={href}
          className={`relative rounded-full px-3 py-1.5 text-sm font-medium transition ${
            active ? "bg-wine-50 text-wine-700" : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
          {badge?.count ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-wine-600 px-1 text-[10px] font-bold leading-none text-paper">
              {badge.count > 9 ? "9+" : badge.count}
            </span>
          ) : badge?.dot ? (
            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-wine-600 ring-2 ring-paper" />
          ) : null}
        </Link>
      );
    },
    [pathname]
  );

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={isMember ? "/home" : "/bridge"}
            className="font-display text-lg font-bold tracking-tight text-wine-700"
          >
            인연
          </Link>
          <nav className="flex items-center gap-1">
            {isMember && nav("홈", "/home")}
            {isMember && nav("매칭함", "/matches", { count: actionable, dot: hasNew })}
            {nav("내 프로필", "/profile")}
            {user.is_admin && nav("관리자", "/admin")}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink-faint sm:block">{user.name}</span>
          <button
            onClick={handleLogout}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:bg-cream"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
