import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../env';

export type StoredObject = { size: number; contentType: string | undefined };

export interface Storage {
  /** Presigned PUT that only accepts exactly this content type and length. */
  presignPut(key: string, contentType: string, size: number): Promise<{ url: string; headers: Record<string, string> }>;
  head(key: string): Promise<StoredObject | null>;
  /** Server-side upload (imports, generated previews). */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const PUT_EXPIRY_SECONDS = 5 * 60;

/** S3-compatible storage: AWS S3 in production (instance role or keys), Cloudflare R2, or SeaweedFS locally. */
export function createS3Storage(env: Env): Storage | null {
  if (!env.S3_BUCKET || !env.MEDIA_PUBLIC_URL) return null;
  const client = new S3Client({
    region: env.S3_REGION,
    // Otherwise the SDK bakes a checksum of an empty body into presigned URLs and every browser PUT fails.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE } : {}),
    ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } }
      : {}),
  });
  const Bucket = env.S3_BUCKET;
  const base = env.MEDIA_PUBLIC_URL.replace(/\/+$/, '');

  return {
    async presignPut(key, contentType, size) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: size }), {
        expiresIn: PUT_EXPIRY_SECONDS,
        signableHeaders: new Set(['content-type', 'content-length']),
      });
      return { url, headers: { 'Content-Type': contentType } };
    },
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (err) {
        if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));
    },
    async readStart(key, bytes) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return (await res.Body?.transformToByteArray()) ?? new Uint8Array();
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    publicUrl(key) {
      return `${base}/${key}`;
    },
  };
}
