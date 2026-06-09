import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const generatedQualityVersion = 'quality-v1'

export type GeneratedArtifactManifest = {
  files: Array<{
    contentType: string
    key: string
    name: string
    url: string
  }>
  provider: 'cloudflare-r2' | 'render-local'
  qualityVersion: typeof generatedQualityVersion
  scenarioJsonUrl: string
  sourceVideoUrl: string
}

type R2Config = {
  accessKeyId: string
  bucket: string
  endpoint: string
  publicBaseUrl: string
  secretAccessKey: string
}

export function getR2ConfigFromEnv(env = process.env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? ''
  const endpoint =
    env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? ''
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? ''
  const bucket = env.R2_BUCKET?.trim() ?? ''
  const publicBaseUrl = normalizeBaseUrl(env.R2_PUBLIC_BASE_URL)

  if (
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null
  }

  return {
    accessKeyId,
    bucket,
    endpoint: normalizeBaseUrl(endpoint),
    publicBaseUrl,
    secretAccessKey,
  }
}

export function isR2Configured(env = process.env) {
  return Boolean(getR2ConfigFromEnv(env))
}

export function buildGeneratedArtifactKey(
  jobId: string,
  fileName: string,
  qualityVersion = generatedQualityVersion,
) {
  assertSafeGeneratedJobId(jobId)
  assertSafeGeneratedArtifactName(fileName)

  return `generated/${jobId}/${qualityVersion}/${fileName}`
}

export function buildGeneratedArtifactUrl(publicBaseUrl: string, key: string) {
  return `${normalizeBaseUrl(publicBaseUrl)}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

export function buildGeneratedArtifactManifest(input: {
  baseUrl: string
  fileNames: string[]
  jobId: string
  provider: GeneratedArtifactManifest['provider']
}) {
  const files = input.fileNames.map((name) => {
    const key = buildGeneratedArtifactKey(input.jobId, name)

    return {
      contentType: contentTypeForGeneratedArtifact(name),
      key,
      name,
      url: buildGeneratedArtifactUrl(input.baseUrl, key),
    }
  })
  const scenario = files.find((file) => file.name === 'scenario.json')
  const sourceVideo = files.find((file) => file.name === 'source.mp4')

  if (!scenario || !sourceVideo) {
    throw new Error('scenario.json과 source.mp4 artifact가 필요합니다.')
  }

  return {
    files,
    provider: input.provider,
    qualityVersion: generatedQualityVersion,
    scenarioJsonUrl: scenario.url,
    sourceVideoUrl: sourceVideo.url,
  } satisfies GeneratedArtifactManifest
}

export async function uploadFileToR2(input: {
  config: R2Config
  contentType: string
  filePath: string
  key: string
}) {
  const body = await readFile(input.filePath)
  const endpoint = new URL(input.config.endpoint)
  const canonicalUri = `/${input.config.bucket}/${input.key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const url = new URL(canonicalUri, endpoint.origin)
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body)
  const host = url.host
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n')
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = getSignatureKey(
    input.config.secretAccessKey,
    dateStamp,
    'auto',
    's3',
  )
  const signature = hmacHex(signingKey, stringToSign)
  const authorization = [
    'AWS4-HMAC-SHA256',
    `Credential=${input.config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const response = await fetch(url, {
    body,
    headers: {
      authorization,
      'content-type': input.contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    method: 'PUT',
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(
      `R2 artifact upload failed: ${response.status} ${message}`.trim(),
    )
  }
}

export async function verifyPublicArtifactUrl(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    method: 'HEAD',
  })

  return response.ok
}

export function contentTypeForGeneratedArtifact(fileName: string) {
  if (fileName.endsWith('.json')) {
    return 'application/json; charset=utf-8'
  }
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (fileName.endsWith('.mp4')) {
    return 'video/mp4'
  }
  if (fileName.endsWith('.vtt')) {
    return 'text/vtt; charset=utf-8'
  }

  return 'application/octet-stream'
}

function assertSafeGeneratedJobId(jobId: string) {
  if (!/^generated-[a-f0-9]{12}$/u.test(jobId)) {
    throw new Error('잘못된 generated job id입니다.')
  }
}

function assertSafeGeneratedArtifactName(fileName: string) {
  if (
    fileName !== 'scenario.json' &&
    fileName !== 'pipeline-trace.json' &&
    fileName !== 'quality-report.json' &&
    fileName !== 'audio-transcript.json' &&
    fileName !== 'visual-caption-evidence.json' &&
    fileName !== 'source.mp4' &&
    fileName !== 'source.info.json' &&
    !/^source\.[a-z0-9-]+(?:-orig)?\.vtt$/iu.test(fileName) &&
    !/^visual-caption-frame-\d{2}\.jpg$/u.test(fileName)
  ) {
    throw new Error(`업로드할 수 없는 generated artifact입니다: ${fileName}`)
  }
}

function normalizeBaseUrl(input: string | undefined) {
  return input?.trim().replace(/\/+$/u, '') ?? ''
}

function sha256Hex(input: string | Buffer) {
  return createHash('sha256').update(input).digest('hex')
}

function hmac(key: Buffer | string, input: string) {
  return createHmac('sha256', key).update(input).digest()
}

function hmacHex(key: Buffer, input: string) {
  return createHmac('sha256', key).update(input).digest('hex')
}

function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, regionName)
  const kService = hmac(kRegion, serviceName)

  return hmac(kService, 'aws4_request')
}

function toAmzDate(date: Date) {
  return date
    .toISOString()
    .replace(/[:-]|\.\d{3}/gu, '')
    .replace(/\.\d{3}/u, '')
}
