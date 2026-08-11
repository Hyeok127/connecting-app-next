import { RequireAuth } from "@/components/RequireAuth";
import { Admin } from "@/components/Admin";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <RequireAuth>
      <Admin />
    </RequireAuth>
  );
}
