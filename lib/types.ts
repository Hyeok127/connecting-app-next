// lib/types.ts — 도메인 타입
export type Role = "member" | "bridge";
export type UserStatus = "active" | "match_pending" | "dating" | "paused" | "suspended";
export type MatchState = "pending" | "accepted" | "rejected" | "expired";
export type ResponseValue = "pending" | "accept" | "reject";

export interface UserRow {
  id: string;
  role: Role;
  name: string;
  pin_hash: string;
  gender: string | null;
  age: number | null;
  /** @deprecated 007에서 job_type/job_role로 분리 */
  job: string | null;
  job_type: string | null; // 직장유형(대기업/스타트업 등)
  job_role: string | null; // 직무(개발/디자인 등)
  /** @deprecated 005에서 life_values로 이관. 006에서 삭제 예정 */
  workplace: string | null;
  life_values: Record<string, string> | null; // 가치관(흡연/음주/문신/종교)
  email: string | null; // 알림 이메일
  consent_version: string | null; // 동의한 약관 버전
  consent_at: number | null;
  region: string | null;
  mbti: string | null;
  keywords: string; // JSON array
  photos: string; // JSON array
  contact: string | null;
  status: UserStatus;
  trust_score: number;
  invited_by: string | null;
  invite_code: string;
  is_admin: number | 0 | 1;
  created_at: number;
}

// 클라이언트에 노출되는 사용자 (AuthProvider / 컴포넌트용)
export interface User {
  id: string;
  name: string;
  role: Role;
  status: UserStatus;
  is_admin: boolean;
  gender: string | null;
  age: number | null;
  job: string | null; // 레거시
  jobType: string | null;
  jobRole: string | null;
  region: string | null;
  mbti: string | null;
  keywords: string[] | null;
  values: Record<string, string>; // 가치관 설문(술/담배/문신/종교)
  photos: string[] | null;
  contact: string | null;
  invite_code: string | null;
  invited_by: string | null;
  trust_score: number;
  points: number;
  batch_completed?: boolean;
  pending_rankings?: number;
  created_at: number;
}

export interface PreferencesRow {
  user_id: string;
  genders: string;
  age_min: number | null;
  age_max: number | null;
  /** @deprecated 007에서 job_types/job_roles로 분리 */
  jobs: string;
  job_types: string[] | null; // 바라는 직장유형
  job_roles: string[] | null; // 바라는 직무
  /** @deprecated 005에서 value_prefs로 이관. 006에서 삭제 예정 */
  workplaces: string;
  value_prefs: Record<string, string[]> | null; // 상대에게 바라는 가치관
  regions: string;
  mbtis: string;
  updated_at: number;
}

export interface MatchRow {
  id: string;
  cycle_date: string;
  user_a: string;
  user_b: string;
  score: number;
  state: MatchState;
  a_response: ResponseValue;
  b_response: ResponseValue;
  respond_deadline: number;
  created_at: number;
  closed_at: number | null;
}

export interface MeetingRow {
  id: string;
  match_id: string;
  status: "active" | "closed";
  started_at: number;
  closed_at: number | null;
}

export interface FeedbackRow {
  id: string;
  meeting_id: string;
  from_user: string;
  decision: "continue" | "close" | null;
  reason_category: string | null;
  no_show: number;
  created_at: number;
}

export interface SessionRow {
  token: string;
  user_id: string;
  created_at: number;
}
