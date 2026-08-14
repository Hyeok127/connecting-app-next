import { RequireAuth } from "@/components/RequireAuth";
import { Admin } from "@/components/Admin";

export const dynamic = "force-dynamic";

// 운영/개발자 콘솔 — 별도 주소(/ops). 관리자(is_admin)만 접근.
export default function OpsPage() {
  return (
    <RequireAuth adminOnly>
      <Admin />
    </RequireAuth>
  );
}
