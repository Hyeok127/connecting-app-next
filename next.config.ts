import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 노트북 dev 서버를 tailnet(휴대폰 등)에서 열어볼 때 자산 요청이 차단되지 않도록 허용.
  allowedDevOrigins: ["100.125.135.35", "laptop-nt9-wsl.taildfcc41.ts.net"],
  // /api/health가 "저장소의 마이그레이션 목록 vs DB 적용 이력"을 대조하려면
  // 서버리스 번들에 .sql 파일이 들어가야 한다. 기본 트레이싱은 코드 임포트만 따라가므로
  // fs.readdirSync로 읽는 이 디렉터리는 명시하지 않으면 프로덕션에서만 조용히 비어 버린다.
  outputFileTracingIncludes: {
    "/api/health": ["./supabase/migrations/**/*.sql"],
  },
  // HTML 문서는 캐시하지 않고 항상 최신을 받게 한다(테스트 중 옛 화면 캐시 방지).
  // 해시된 정적 자산(_next/static)은 그대로 캐시 — 제외.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
