"use client";
import { RequireAuth } from "@/components/RequireAuth";
import { Matches } from "@/components/Matches";

export default function MatchesPage() {
  return (
    <RequireAuth memberOnly>
      <Matches />
    </RequireAuth>
  );
}
