// lib/constants.ts — 비즈니스 상수 (DESIGN.md 기준)
export const POINTS = { match_success: 10, couple_success: 50 };
export const MAX_RANK = 10; // 추천/순위 최대 인원
export const TOP_N = 3; // 상호 top-3
export const RESPOND_HOURS = 12; // R10
export const RANKING_VALID_DAYS = 3; // R17
export const TRUST = { no_show: -50, clean_close: 5 }; // R20
export const MEETING_MAX_DAYS = 30; // R22
export const CLOSE_REASONS = [
  "가치관 차이",
  "대화가 잘 안 맞음",
  "외모/스타일",
  "상대 무응답",
  "일정 문제",
  "기타",
];
export const SESSION_TTL_MS = 30 * 86400e3; // 세션 30일
export const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 혼동 문자 제외
export const PHOTO_BUCKET = "photos";
export const PHOTO_MAX = 3;
export const PHOTO_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
export const LOGIN_FAIL_MAX = 5; // 계정당 실패 잠금 임계값
export const LOGIN_LOCK_MS = 15 * 60 * 1000; // 실패 잠금 시간
export const LOGIN_IP_MAX = 10; // IP당 15분 로그인 시도
export const SIGNUP_IP_MAX = 20; // IP당 15분 가입 시도
export const RATE_WINDOW_MS = 15 * 60 * 1000;
