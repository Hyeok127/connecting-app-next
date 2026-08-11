"use client";
import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthPage } from "@/components/AuthPage";
import { Spinner } from "@/components/ui";

export function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace(user.role === "member" ? "/home" : "/bridge");
  }, [user, loading, router]);

  if (loading) return <Spinner />;
  if (user) return <Spinner />;

  return (
    <Suspense fallback={<Spinner />}>
      <AuthPage />
    </Suspense>
  );
}
