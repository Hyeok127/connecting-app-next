import { Landing } from "@/components/Landing";

// 프리렌더 캐시(s-maxage 1년)로 옛 화면이 남는 걸 막기 위해 동적 렌더로 고정.
export const dynamic = "force-dynamic";

export default function RootPage() {
  return <Landing />;
}
