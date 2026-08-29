import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export const config = {
  maxDuration: 300,
};

const UPSTREAM_BASE_URL = (
  process.env.KNOWLEDGE_API_BASE_URL ||
  process.env.BACKEND_API_BASE_URL ||
  'https://api.tracuuykhoa.vn'
).replace(/\/+$/, '');

const UPSTREAM_API_KEY = (process.env.KNOWLEDGE_API_KEY || '').trim();

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function getForwardPath(req: IncomingMessage): string {
  const incoming = new URL(req.url || '/api/proxy', 'http://vercel.local');
  const rawPathParam = incoming.searchParams.get('path') || '';
  incoming.searchParams.delete('path');

  const queryIndex = rawPathParam.indexOf('?');
  const rawPath = queryIndex >= 0 ? rawPathParam.slice(0, queryIndex) : rawPathParam;
  const embeddedQuery = queryIndex >= 0 ? rawPathParam.slice(queryIndex + 1) : '';

  const cleanPath = rawPath
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join('/');

  const suffix = cleanPath ? `/${cleanPath}` : '/';

  const mergedQuery = new URLSearchParams(embeddedQuery);
  for (const [key, value] of incoming.searchParams.entries()) {
    mergedQuery.append(key, value);
  }

  const query = mergedQuery.toString();
  return query ? `${suffix}?${query}` : suffix;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (!UPSTREAM_API_KEY) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'CONFIG_MISSING',
      message: 'KNOWLEDGE_API_KEY is not configured on Vercel.',
    }));
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(getForwardPath(req), `${UPSTREAM_BASE_URL}/`);
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'INVALID_UPSTREAM_URL',
      message: error?.message || 'Invalid upstream URL',
    }));
    return;
  }

  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
    headers[name] = value;
  }

  headers['x-api-key'] = UPSTREAM_API_KEY;
  headers['x-forwarded-host'] = String(req.headers.host || 'med-trung.vercel.app');
  headers['x-forwarded-proto'] = 'https';

  const transport = targetUrl.protocol === 'http:' ? http : https;
  const upstreamReq = transport.request(
    targetUrl,
    {
      method: req.method || 'GET',
      headers,
      timeout: 300_000,
    },
    (upstreamRes) => {
      res.statusCode = upstreamRes.statusCode || 502;

      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
        res.setHeader(name, value as string | string[]);
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on('timeout', () => {
    upstreamReq.destroy(new Error('Upstream request timed out'));
  });

  upstreamReq.on('error', (error: any) => {
    if (res.headersSent) {
      res.end();
      return;
    }

    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'UPSTREAM_UNAVAILABLE',
      message: error?.message || 'Cannot connect to Document Management API.',
    }));
  });

  req.pipe(upstreamReq);
}
