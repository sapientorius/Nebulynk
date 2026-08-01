import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  resolveStorageS3AccessKey,
  resolveStorageS3Endpoint,
  resolveStorageS3Region,
  resolveStorageS3SecretKey
} from './security-config.js'

export function createStorageClient(options = {}) {
  const endpoint = options.endpoint || resolveStorageS3Endpoint(process.env)
  const accessKeyId = resolveStorageS3AccessKey(process.env)
  const secretAccessKey = resolveStorageS3SecretKey(process.env)

  return new S3Client({
    endpoint,
    region: options.region || resolveStorageS3Region(process.env),
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true
  })
}

export async function initBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
  }
}

export async function uploadFile(client, { buffer, key, mime, bucket }) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mime
  }))
}

export async function copyStoredFile(client, {
  sourceKey,
  sourceBucket,
  targetKey,
  targetBucket
}) {
  await client.send(new CopyObjectCommand({
    Bucket: targetBucket,
    Key: targetKey,
    CopySource: `/${encodeURIComponent(sourceBucket)}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`
  }))
}

export async function getFileUrl(client, { key, bucket, expiresIn = 3600 }) {
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: key
  }), { expiresIn })
}

export async function readStoredFile(client, { key, bucket }) {
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key
  }))

  const bytes = await response.Body.transformToByteArray()
  return {
    buffer: Buffer.from(bytes),
    mime: response.ContentType || 'application/octet-stream',
    size: Number(response.ContentLength || bytes.length || 0)
  }
}

export async function deleteFile(client, { key, bucket }) {
  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  }))
}
