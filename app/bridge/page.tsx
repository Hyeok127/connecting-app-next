import { RequireAuth } from "@/components/RequireAuth";
import { Profile } from "@/components/Profile";

export const dynamic = "force-dynamic";

export default function BridgePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
