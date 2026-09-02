// lib/blocks.ts — 차단 관계 조회 (P1-2)
//
// 왜 별도 파일인가: 차단은 그동안 "추천에서 제외"에만 쓰였다(lib/matching.ts).
// 그래서 이미 매칭된 상대를 차단해도 **이미 공개된 연락처와 교환한 사진은 계속 보였다.**
// 매칭함·만남 화면에서도 같은 판정이 필요해 한 곳으로 뺀다.
import { getSupabase } from "@/lib/supabase";

// 나와 차단 관계(내가 차단했거나 나를 차단한)인 상대 id 집합.
// 방향을 구분하지 않는다 — 어느 쪽이 차단했든 정보 공개는 멈춰야 한다.
export async function blockedPeerIds(userId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from("blocks")
    .select("user_id,target_id")
    .or(`user_id.eq.${userId},target_id.eq.${userId}`);
  // 조회 실패 시 빈 집합을 돌려주면 차단이 조용히 풀린다. 호출부가 알 수 있게 던진다.
  if (error) throw new Error(`차단 목록 조회 실패: ${error.message}`);
  const out = new Set<string>();
  for (const b of (data as { user_id: string; target_id: string }[]) ?? [])
    out.add(b.user_id === userId ? b.target_id : b.user_id);
  return out;
}
