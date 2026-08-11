import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 노트북 dev 서버를 tailnet(휴대폰 등)에서 열어볼 때 자산 요청이 차단되지 않도록 허용.
  // dev 모드에만 적용되는 옵션이라 운영 배포에는 영향 없음.
  allowedDevOrigins: ["100.125.135.35", "laptop-nt9-wsl.taildfcc41.ts.net"],
};

export default nextConfig;
