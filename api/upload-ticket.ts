import type { IncomingMessage, ServerResponse } from 'http';
import { createHmac, randomBytes } from 'crypto';

export const config = {
  maxDuration: 10,
};

const UPSTREAM_BASE_URL = (
  process.env.KNOWLEDGE_API_BASE_URL ||
  process.env.BACKEND_API_BASE_URL ||
  'https://api.tracuuykhoa.vn'
).replace(/\/+$/, '');

const UPSTREAM_API_KEY = (process.env.KNOWLEDGE_API_KEY || '').trim();
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const TOKEN_TTL_SECONDS = 5 * 60;

function base64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
    return;
  }

  if (!UPSTREAM_API_KEY) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'CONFIG_MISSING',
      message: 'KNOWLEDGE_API_KEY is not configured on Vercel.',
    }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const fileName = String(body?.file_name || '').trim();
    const fileSize = Number(body?.file_size || 0);

    if (!fileName.toLowerCase().endsWith('.pdf')) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'INVALID_FILE',
        message: 'Only PDF documents are supported.',
      }));
      return;
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'INVALID_FILE_SIZE',
        message: 'PDF size must be between 1 byte and 100 MB.',
      }));
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      v: 1,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      nonce: randomBytes(12).toString('hex'),
      method: 'POST',
      path: '/documents/upload',
      max_bytes: MAX_UPLOAD_BYTES,
      declared_file_bytes: Math.trunc(fileSize),
    };

    const payloadPart = base64url(JSON.stringify(payload));
    const signature = createHmac('sha256', UPSTREAM_API_KEY)
      .update(payloadPart)
      .digest();
    const token = `${payloadPart}.${base64url(signature)}`;

    const uploadUrl = `${UPSTREAM_BASE_URL}/documents/upload?upload_token=${encodeURIComponent(token)}`;

    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      token,
      upload_url: uploadUrl,
      expires_at: payload.exp,
      max_upload_bytes: MAX_UPLOAD_BYTES,
    }));
  } catch (error: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'INVALID_REQUEST',
      message: error?.message || 'Cannot create upload ticket.',
    }));
  }
}
