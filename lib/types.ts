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
  job: string | null;
  workplace: string | null;
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
  job: string | null;
  workplace: string | null;
  region: string | null;
  mbti: string | null;
  keywords: string[] | null;
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
  jobs: string;
  workplaces: string;
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
  a_photo_consent: number; // 004: 매칭 후 사진 교환 동의 (0/1)
  b_photo_consent: number;
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
