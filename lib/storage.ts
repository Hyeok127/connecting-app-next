// lib/storage.ts — 사진 직접 업로드(Signed Upload URL) / 조회(Signed URL)
import { getSupabase } from "@/lib/supabase";
import { PHOTO_BUCKET, PHOTO_EXTS } from "@/lib/constants";
import { genId } from "@/lib/utils";

export function photoObjectPath(userId: string, ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  const safe = PHOTO_EXTS.includes(e) ? e : "jpg";
  return `${userId}/${Date.now()}-${genId()}.${safe}`;
}

// 클라이언트가 파일을 Supabase Storage에 직접 PUT하도록 signed upload URL 발급
export async function createSignedUploadUrl(userId: string, ext: string): Promise<{
  objectPath: string;
  uploadUrl: string;
}> {
  const objectPath = photoObjectPath(userId, ext);
  const { data, error } = await getSupabase()
    .storage.from(PHOTO_BUCKET)
    .createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(error?.message || "업로드 URL 생성 실패");
  return { objectPath, uploadUrl: data.signedUrl };
}
