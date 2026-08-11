import { RequireAuth } from "@/components/RequireAuth";
import { Matches } from "@/components/Matches";

export const dynamic = "force-dynamic";

export default function MatchesPage() {
  return (
    <RequireAuth memberOnly>
      <Matches />
    </RequireAuth>
  );
}
