"use client";
import { RequireAuth } from "@/components/RequireAuth";
import { Admin } from "@/components/Admin";

export default function AdminPage() {
  return (
    <RequireAuth>
      <Admin />
    </RequireAuth>
  );
}
