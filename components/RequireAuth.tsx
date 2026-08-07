"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";

export function RequireAuth({
  children,
  memberOnly = false,
}: {
  children: React.ReactNode;
  memberOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/");
    } else if (memberOnly && user.role !== "member") {
      router.replace("/bridge");
    }
  }, [user, loading, memberOnly, router]);

  if (loading || !user) return <Spinner />;
  if (memberOnly && user.role !== "member") return <Spinner />;
  return <>{children}</>;
}
