"use client";
import { RequireAuth } from "@/components/RequireAuth";
import { Home } from "@/components/Home";

export default function HomePage() {
  return (
    <RequireAuth memberOnly>
      <Home />
    </RequireAuth>
  );
}
