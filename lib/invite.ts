// lib/invite.ts — 초대 체인 / 공통 연결자 (R23)
import { getUserById } from "@/lib/auth";

export async function inviteChain(userId: string, maxDepth = 6): Promise<string[]> {
  const chain: string[] = [];
  let cur = await getUserById(userId);
  while (cur && cur.invited_by && chain.length < maxDepth) {
    chain.push(cur.invited_by);
    cur = await getUserById(cur.invited_by);
  }
  return chain;
}

export async function commonConnector(a: string, b: string): Promise<string | null> {
  const cb = new Set(await inviteChain(b));
  const common = (await inviteChain(a)).find((id) => cb.has(id));
  if (!common) return null; // "연결 경로가 긴 사이"
  const u = await getUserById(common);
  return u ? u.name : null;
}
