"use client";
import { RequireAuth } from "@/components/RequireAuth";
import { Profile } from "@/components/Profile";

export default function BridgePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
