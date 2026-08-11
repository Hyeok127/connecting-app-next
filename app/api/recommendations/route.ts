import type { NextRequest } from "next/server";
import { authFromToken, bearerToken } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/http";
import { recommendationsFor } from "@/lib/matching";
import { publicUser } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const user = await authFromToken(bearerToken(req));
  if (!user) return unauthorized();
  if (user.role !== "member") return forbidden("일반 회원만 사용할 수 있습니다."); // R4
  if (user.status === "suspended") return forbidden("정지된 계정입니다. 운영자에게 문의해주세요."); // R26
  if (user.status === "dating") return ok({ candidates: [] }); // R14

  const recs = await recommendationsFor(user.id, user);
  const maxScore = Math.max(0.0001, ...recs.map((r) => r.score));

  // publicUser에 photos/contact 미포함(R5) + 추천 사유(궁합 강도·겹친 키워드·일치 가치관)
  const candidates = recs.map((r) => ({
    ...publicUser(r.user),
    match: {
      // 강도: 리스트 내 최고점 대비 비율(최소 0.15로 가시성 확보) → UI에서 진하기로 표현
      strength: Math.max(0.15, r.score / maxScore),
      score: Math.round(r.score * 10) / 10,
      sharedKeywords: r.sharedKeywords,
      valueMatches: r.valueMatches, // [{label:"종교", value:"무교"}] — 내 선호를 충족한 상대 실제 값
    },
  }));
  return ok({ candidates });
}
