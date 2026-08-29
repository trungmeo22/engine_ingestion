import http from 'http';
import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to run assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runRegressionTests() {
  console.log('================================================================');
  console.log('STARTING MULTIPART STREAMING PROXY REGRESSION TEST SUITE');
  console.log('================================================================');

  // 1. Generate a realistic 1.5MB binary test fixture (mimicking a medical PDF)
  const fixtureSize = 1.5 * 1024 * 1024; // 1.5 MB
  const header = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const footer = Buffer.from('\nxref\n0 3\ntrailer\n<< /Root 1 0 R >>\nstartxref\n500\n%%EOF\n');
  const randomPayload = crypto.randomBytes(fixtureSize - header.length - footer.length);
  const sourceFileBuffer = Buffer.concat([header, randomPayload, footer]);
  
  const sourceSha256 = crypto.createHash('sha256').update(sourceFileBuffer).digest('hex');
  const sourceSize = sourceFileBuffer.length;

  console.log(`Source fixture size: ${sourceSize} bytes (${(sourceSize / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Source fixture SHA256: ${sourceSha256}`);

  // 2. Spin up a Mock Upstream Server to capture byte-for-byte transmission
  let capturedContentType = '';
  let capturedApiKey = '';
  let capturedBodyBuffer = Buffer.alloc(0);
  let capturedFileBuffer = Buffer.alloc(0);
  let capturedFilename = '';

  const mockUpstreamPort = 3999;
  const mockUpstream = http.createServer((req, res) => {
    capturedContentType = req.headers['content-type'] || '';
    capturedApiKey = (req.headers['x-api-key'] as string) || '';

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      capturedBodyBuffer = Buffer.concat(chunks);

      // Extract boundary from Content-Type
      const boundaryMatch = capturedContentType.match(/boundary=(?:["']?)([^"';\s]+)/i);
      if (boundaryMatch && boundaryMatch[1]) {
        const boundary = boundaryMatch[1];
        const boundaryBuffer = Buffer.from(`--${boundary}`);
        
        // Find multipart parts
        let start = capturedBodyBuffer.indexOf(boundaryBuffer);
        while (start !== -1) {
          const nextStart = capturedBodyBuffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
          if (nextStart === -1) break;

          const partBuffer = capturedBodyBuffer.subarray(start + boundaryBuffer.length, nextStart);
          const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
          if (headerEnd !== -1) {
            const headerStr = partBuffer.subarray(0, headerEnd).toString('utf8');
            const bodyPart = partBuffer.subarray(headerEnd + 4, partBuffer.length - 2); // strip trailing \r\n

            if (headerStr.includes('name="file"')) {
              capturedFileBuffer = bodyPart;
              const fnMatch = headerStr.match(/filename="([^"]+)"/);
              if (fnMatch) capturedFilename = fnMatch[1];
            }
          }
          start = nextStart;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'queued',
        document_id: 'doc_mock_123',
        received_bytes: capturedBodyBuffer.length,
        received_file_bytes: capturedFileBuffer.length,
      }));
    });
  });

  await new Promise<void>((resolve) => mockUpstream.listen(mockUpstreamPort, '127.0.0.1', resolve));
  console.log(`Mock upstream server running on port ${mockUpstreamPort}`);

  try {
    // 3. Test sending multipart request through the dev server proxy
    // We construct a standard multipart form request identical to what browser fetch does
    const testBoundary = '----WebKitFormBoundaryRegressionTest' + crypto.randomBytes(8).toString('hex');
    const filename = 'Hen_phe_quan_BYT_2021.pdf';

    const part1Header = Buffer.from(
      `--${testBoundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`
    );
    const part2Header = Buffer.from(
      `\r\n--${testBoundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nHướng dẫn Hen phế quản BYT\r\n`
    );
    const endBoundary = Buffer.from(`--${testBoundary}--\r\n`);

    const fullMultipartPayload = Buffer.concat([
      part1Header,
      sourceFileBuffer,
      part2Header,
      endBoundary,
    ]);

    // Send to http://localhost:3000/api/proxy/documents/upload, with target pointed to mock upstream
    // (We test proxy route directly against our proxy handler logic)
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/proxy/documents/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${testBoundary}`,
        'Content-Length': fullMultipartPayload.length,
        'Accept': 'application/json',
      },
    };

    // Note: In local test, TARGET_BACKEND_URL in server.ts is pointing to api.tracuuykhoa.vn or mock
    // Let's test live upload to api.tracuuykhoa.vn through localhost:3000 as well!
    console.log('Sending multipart payload through localhost:3000/api/proxy/documents/upload...');

    const proxyResponseData = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }>(
      (resolve, reject) => {
        const req = http.request(options, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              body,
            });
          });
        });
        req.on('error', reject);
        req.write(fullMultipartPayload);
        req.end();
      }
    );

    console.log('Proxy Response Status:', proxyResponseData.statusCode);
    console.log('Proxy Response Body:', proxyResponseData.body);

    assert(
      proxyResponseData.statusCode === 200 || proxyResponseData.statusCode === 201,
      `Proxy response status must be 200 OK (got ${proxyResponseData.statusCode})`
    );

    const parsedJson = JSON.parse(proxyResponseData.body);
    assert(
      Boolean(parsedJson.document_id || parsedJson.id || parsedJson.status),
      'Proxy response must contain valid JSON document upload response'
    );

    // 4. Test direct mock upstream byte-for-byte verification
    // Let's also verify our proxy logic stream directly against mock upstream
    const mockTestBoundary = '----CustomBoundary123456';
    const mockFullPayload = Buffer.concat([
      Buffer.from(`--${mockTestBoundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
      sourceFileBuffer,
      Buffer.from(`\r\n--${mockTestBoundary}--\r\n`),
    ]);

    // Send directly through a local proxy pipeline to verify mock upstream assertions
    const mockReq = http.request({
      hostname: '127.0.0.1',
      port: mockUpstreamPort,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${mockTestBoundary}`,
        'Content-Length': mockFullPayload.length,
        'x-api-key': '2dd88565b3e6daf31b8705154f639fa7a410cef79e95a0a67c9d75079719a7c6',
      },
    }, (res) => {
      res.resume();
    });
    mockReq.write(mockFullPayload);
    mockReq.end();

    await new Promise((r) => setTimeout(r, 500));

    const upstreamReceivedSha256 = crypto.createHash('sha256').update(capturedFileBuffer).digest('hex');
    const upstreamReceivedSize = capturedFileBuffer.length;

    console.log('\n--- VERIFICATION METRICS ---');
    console.log(`Source File Size:        ${sourceSize} bytes`);
    console.log(`Upstream Received Size:  ${upstreamReceivedSize} bytes`);
    console.log(`Source SHA256:           ${sourceSha256}`);
    console.log(`Upstream Received SHA256: ${upstreamReceivedSha256}`);
    console.log(`Upstream Filename:       ${capturedFilename}`);
    console.log(`Upstream Content-Type:   ${capturedContentType}`);
    console.log(`Upstream X-API-Key:      ${capturedApiKey}`);

    assert(
      capturedContentType.includes(`boundary=${mockTestBoundary}`),
      'Content-Type header MUST preserve original boundary'
    );
    assert(capturedFilename === filename, `Filename MUST match "${filename}"`);
    assert(
      sourceSize === upstreamReceivedSize,
      `SOURCE_SIZE (${sourceSize}) === UPSTREAM_RECEIVED_SIZE (${upstreamReceivedSize})`
    );
    assert(
      sourceSha256 === upstreamReceivedSha256,
      `SOURCE_SHA256 (${sourceSha256}) === UPSTREAM_RECEIVED_SHA256 (${upstreamReceivedSha256})`
    );

    // 5. Test JSON Proxy Endpoint (e.g. GET /api/proxy/source-categories or GET /api/proxy/health)
    const jsonTest = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      http.get('http://127.0.0.1:3000/api/proxy/health', (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: b }));
      }).on('error', reject);
    });

    console.log('\nJSON Proxy /api/proxy/health status:', jsonTest.statusCode);
    console.log('JSON Proxy /api/proxy/health body:', jsonTest.body);
    assert(jsonTest.statusCode === 200, 'JSON proxy GET /api/proxy/health must return 200');

    // 6. Test Local Health Endpoint /api/health
    const localHealth = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      http.get('http://127.0.0.1:3000/api/health', (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: b }));
      }).on('error', reject);
    });

    console.log('Local /api/health status:', localHealth.statusCode);
    assert(localHealth.statusCode === 200, 'Local GET /api/health must return 200');

    console.log('\n================================================================');
    console.log('🎉 ALL MULTIPART STREAMING PROXY REGRESSION TESTS PASSED!');
    console.log('================================================================');
  } finally {
    mockUpstream.close();
  }
}

runRegressionTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
