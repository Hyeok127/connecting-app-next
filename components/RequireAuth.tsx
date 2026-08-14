"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";

export function RequireAuth({
  children,
  memberOnly = false,
  adminOnly = false,
}: {
  children: React.ReactNode;
  memberOnly?: boolean;
  adminOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
    } else if (memberOnly && user.role !== "member") {
      router.replace("/bridge");
    } else if (adminOnly && !user.is_admin) {
      router.replace("/");
    }
  }, [user, loading, memberOnly, adminOnly, router]);

  if (loading || !user) return <Spinner />;
  if (memberOnly && user.role !== "member") return <Spinner />;
  if (adminOnly && !user.is_admin) return <Spinner />;
  return <>{children}</>;
}
