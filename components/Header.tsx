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
            active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"
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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-1">
          {isMember && nav("홈", "/home")}
          {isMember && nav("매칭함", "/matches")}
          {nav("내 프로필", "/profile")}
          {user.is_admin && nav("관리자", "/admin")}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:block">{user.name}</span>
          <button
            onClick={handleLogout}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
