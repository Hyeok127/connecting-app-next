// lib/serialize.ts — 응답용 유저 직렬화 (R5: 추천에는 사진/연락처 미포함)
import type { UserRow } from "@/lib/types";
import { PHOTO_BUCKET } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase";
import { parseValues } from "@/lib/values";

export interface PublicUser {
  id: string;
  role: UserRow["role"];
  name: string;
  gender: string | null;
  age: number | null;
  job: string | null; // 레거시(표시 폴백용)
  jobType: string | null;
  jobRole: string | null;
  region: string | null;
  mbti: string | null;
  keywords: string[];
  values: Record<string, string>; // 가치관 설문 (users.life_values)
  status: UserRow["status"];
  createdAt: number;
  photos?: string[];
  contact?: string | null;
}

export function parseJsonArray(s?: string | null): string[] {
  try {
    const a = JSON.parse(s || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function publicUser(u: UserRow, opts: { photos?: boolean; contact?: boolean } = {}): PublicUser {
  const base: PublicUser = {
    id: u.id,
    role: u.role,
    name: u.name,
    gender: u.gender,
    age: u.age,
    job: u.job,
    jobType: u.job_type,
    jobRole: u.job_role,
    region: u.region,
    mbti: u.mbti,
    keywords: parseJsonArray(u.keywords),
    values: parseValues(u.life_values ?? u.workplace), // 이관 전 레거시(workplace)도 허용
    status: u.status,
    createdAt: u.created_at,
  };
  if (opts.photos) base.photos = parseJsonArray(u.photos);
  if (opts.contact) base.contact = u.contact;
  return base;
}

export async function signedPhotoUrls(paths: string[], expiresIn = 3600): Promise<string[]> {
  if (paths.length === 0) return [];
  const sb = getSupabase();
  const out: string[] = [];
  for (const p of paths) {
    const { data } = await sb.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(p, expiresIn);
    out.push(data?.signedUrl ?? "");
  }
  return out;
}

// photos 포함 직렬화 + 실제 서명 URL로 변환 (본인/매칭된 상대에게만 사용)
export async function publicUserWithPhotos(u: UserRow): Promise<PublicUser> {
  const signed = await signedPhotoUrls(parseJsonArray(u.photos));
  const base = publicUser(u, { photos: true });
  base.photos = signed;
  return base;
}
