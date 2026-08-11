"use client";
import { useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const nav = useCallback(
    (label: string, href: string) => {
      const active = pathname === href;
      return (
        <Link
          key={href}
          href={href}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            active ? "bg-wine-50 text-wine-700" : "text-ink-soft hover:text-ink"
          }`}
        >
          {label}
        </Link>
      );
    },
    [pathname]
  );

  if (!user) return null;

  const isMember = user.role === "member";

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
            {isMember && nav("매칭함", "/matches")}
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
