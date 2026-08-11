import { RequireAuth } from "@/components/RequireAuth";
import { Profile } from "@/components/Profile";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}
