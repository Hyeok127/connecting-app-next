// lib/storage.ts — 사진 업로드/삭제. R2가 설정돼 있으면 R2, 아니면 Supabase Storage.
import { getSupabase } from "@/lib/supabase";
import { PHOTO_BUCKET, PHOTO_EXTS } from "@/lib/constants";
import { genId } from "@/lib/utils";
import { r2Enabled, r2SignedUploadUrl, r2Delete, contentTypeForExt } from "@/lib/r2";

export function photoObjectPath(userId: string, ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  const safe = PHOTO_EXTS.includes(e) ? e : "jpg";
  return `${userId}/${Date.now()}-${genId()}.${safe}`;
}

// 클라이언트가 파일을 직접 PUT하도록 signed upload URL 발급.
//   R2: contentType을 서명에 포함 → 클라이언트가 같은 Content-Type 헤더로 전송해야 함.
export async function createSignedUploadUrl(userId: string, ext: string): Promise<{
  objectPath: string;
  uploadUrl: string;
  contentType: string;
}> {
  const objectPath = photoObjectPath(userId, ext);
  const contentType = contentTypeForExt(ext);

  if (r2Enabled()) {
    const uploadUrl = await r2SignedUploadUrl(objectPath, contentType);
    return { objectPath, uploadUrl, contentType };
  }

  const { data, error } = await getSupabase().storage.from(PHOTO_BUCKET).createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(error?.message || "업로드 URL 생성 실패");
  return { objectPath, uploadUrl: data.signedUrl, contentType };
}

// 사진 삭제(탈퇴·교체 시). R2 또는 Supabase.
export async function removePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  if (r2Enabled()) {
    await r2Delete(paths);
    return;
  }
  await getSupabase().storage.from(PHOTO_BUCKET).remove(paths).catch(() => {});
}
