// lib/r2.ts — Cloudflare R2(사진 저장소, S3 호환) 헬퍼.
// R2_* 환경변수가 모두 있으면 활성화. 없으면 호출측이 Supabase Storage로 폴백한다.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function r2Enabled(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPE[ext.replace(/^\./, "").toLowerCase()] ?? "application/octet-stream";
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}
const bucket = () => process.env.R2_BUCKET!;

// 클라이언트가 직접 PUT할 presigned 업로드 URL. ContentType을 서명에 포함하므로
// 클라이언트는 반환된 contentType과 동일한 헤더로 전송해야 서명이 일치한다.
export async function r2SignedUploadUrl(key: string, contentType: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn });
}

// 조회용 presigned GET URL(시간 제한). 비공개 버킷이라 이 URL로만 접근 가능.
export async function r2SignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export async function r2Delete(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((Key) => client().send(new DeleteObjectCommand({ Bucket: bucket(), Key })).catch(() => {}))
  );
}
