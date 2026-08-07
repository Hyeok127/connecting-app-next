// lib/upload.ts — 사진을 Supabase Storage에 직접 업로드하고 objectPath 반환
"use client";
import { api } from "@/lib/api";

export function extFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
}

export async function uploadPhoto(file: File): Promise<string> {
  const { objectPath, uploadUrl } = await api<{ objectPath: string; uploadUrl: string }>(
    "/photos/upload-url",
    { method: "POST", body: JSON.stringify({ ext: extFromName(file.name) }) }
  );
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("사진 업로드에 실패했습니다.");
  return objectPath;
}

export async function uploadPhotos(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const f of files) paths.push(await uploadPhoto(f));
  return paths;
}
