// lib/migrations.ts — 저장소의 마이그레이션 파일 목록 vs DB 적용 이력 대조 (P6-1)
//
// 왜 필요한가: 코드 배포(git push → Vercel)와 스키마 변경(수동 Management API)이
// 서로를 모르는 두 파이프라인이다. "머지했으니 반영됐겠지"가 실제로 사고를 낸다.
// /api/health가 미적용 목록을 노출하면 배포 직후 사람 눈에 띈다.
//
// 이 모듈은 DB에 직접 접근하지 않는다. `@/` 경로 별칭은 번들러 기능이라
// node 테스트 러너가 풀지 못하고, 그러면 이 판정 로직에 테스트를 붙일 수 없다.
// 조회는 호출부(app/api/health)가 하고 여기는 순수 판정만 한다.
import fs from "node:fs";
import path from "node:path";

// 서버리스 번들에 supabase/migrations/*.sql이 포함되도록 next.config.ts의
// outputFileTracingIncludes에 등록해 뒀다. 그래도 환경에 따라 없을 수 있으니
// 파일을 못 읽는 것은 오류가 아니라 "알 수 없음"으로 다룬다.
export function repoVersions(): string[] | null {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/i, ""))
      .sort();
  } catch {
    return null;
  }
}

// 저장소에는 없는데 DB에만 적용된 버전(orphan)도 보고한다 — 파일이 지워졌거나
// 다른 브랜치에서 적용된 흔적이라 조용히 넘기면 안 된다.
export function diffMigrations(
  repo: string[],
  applied: string[]
): { pending: string[]; orphan: string[] } {
  const appliedSet = new Set(applied);
  const repoSet = new Set(repo);
  return {
    pending: repo.filter((v) => !appliedSet.has(v)).sort(),
    orphan: applied.filter((v) => !repoSet.has(v)).sort(),
  };
}

export interface MigrationStatus {
  /** 저장소에 있으나 DB에 적용 기록이 없는 것 */
  pending: string[];
  /** DB에는 기록이 있는데 저장소에 파일이 없는 것 (삭제됐거나 다른 브랜치 흔적) */
  orphan: string[];
  applied_count: number;
  repo_count: number | null;
  /** 확인 불가 사유 (테이블 미생성, 파일 접근 불가 등) */
  unknown?: string;
}

/**
 * 적용 이력(DB 조회 결과)과 저장소 파일 목록을 대조한다.
 * @param applied schema_migrations의 version 목록. 조회 실패면 null을 넘긴다.
 * @param queryError 조회 실패 사유(있으면)
 */
export function buildMigrationStatus(
  applied: string[] | null,
  queryError?: string
): MigrationStatus {
  const repo = repoVersions();

  if (applied === null) {
    // 012를 아직 안 돌린 상태가 대표적이다. 이건 "정상"이 아니라 "추적 불가"다.
    return {
      pending: [],
      orphan: [],
      applied_count: 0,
      repo_count: repo?.length ?? null,
      unknown: `schema_migrations 조회 불가: ${queryError ?? "알 수 없는 오류"}`,
    };
  }

  if (!repo) {
    return {
      pending: [],
      orphan: [],
      applied_count: applied.length,
      repo_count: null,
      unknown: "마이그레이션 파일 목록을 읽을 수 없습니다(번들 미포함).",
    };
  }

  const { pending, orphan } = diffMigrations(repo, applied);
  return { pending, orphan, applied_count: applied.length, repo_count: repo.length };
}
