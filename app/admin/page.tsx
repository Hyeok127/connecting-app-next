import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 관리자 콘솔은 /ops로 이전됨.
export default function AdminPage() {
  redirect("/ops");
}
