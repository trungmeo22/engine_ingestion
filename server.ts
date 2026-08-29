import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { URL, fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());

// ============================================================================
// VPS Document Management API Reverse Proxy Bridge (Byte-for-byte streaming)
// MUST BE MOUNTED BEFORE express.json() & body parsers to preserve raw streams
// ============================================================================
const TARGET_BACKEND_URL =
  process.env.KNOWLEDGE_API_BASE_URL ||
  process.env.BACKEND_API_BASE_URL ||
  process.env.NEXT_PUBLIC_KNOWLEDGE_API_BASE_URL ||
  process.env.VITE_KNOWLEDGE_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  'https://api.tracuuykhoa.vn';

const TARGET_API_KEY =
  process.env.KNOWLEDGE_API_KEY ||
  '2dd88565b3e6daf31b8705154f639fa7a410cef79e95a0a67c9d75079719a7c6';

const baseDir = process.env.VERCEL ? '/tmp' : __dirname;
const inputDir = path.join(baseDir, 'input');
const outputDir = path.join(baseDir, 'output');
const storageMetaDir = path.join(baseDir, 'storage_data', 'meta');

try {
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(storageMetaDir)) fs.mkdirSync(storageMetaDir, { recursive: true });
} catch (err) {
  console.warn('Directory initialization notice:', err);
}

const CANONICAL_SPECIALTIES = [
  { code: 'cardiology', name: 'Tim mạch' },
  { code: 'pulmonology', name: 'Hô hấp' },
  { code: 'endocrinology', name: 'Nội tiết - Đái tháo đường' },
  { code: 'nephrology', name: 'Thận học' },
  { code: 'gastroenterology', name: 'Tiêu hóa - Gan mật' },
  { code: 'neurology', name: 'Thần kinh' },
  { code: 'infectious_disease', name: 'Truyền nhiễm' },
  { code: 'oncology', name: 'Ung bướu' },
  { code: 'rheumatology', name: 'Cơ xương khớp' },
  { code: 'dermatology', name: 'Da liễu' },
  { code: 'hematology', name: 'Huyết học' },
  { code: 'pediatrics', name: 'Nhi khoa' },
  { code: 'intensive_care', name: 'Hồi sức cấp cứu' },
  { code: 'general_internal_medicine', name: 'Nội khoa tổng quát' },
];

const CANONICAL_SOURCE_AUTHORITIES = [
  { code: 'byt', name: 'Bộ Y tế Việt Nam', geographic_scope: 'Vietnam', authority_priority: 100 },
  { code: 'esc', name: 'European Society of Cardiology', geographic_scope: 'International', authority_priority: 90 },
  { code: 'other', name: 'Nguồn khác', geographic_scope: 'Other', authority_priority: 40 },
];

const VALID_SOURCE_AUTHORITIES = new Set(['byt', 'esc', 'other']);
const VALID_DOCUMENT_TYPES = new Set([
  'guideline',
  'consensus',
  'position_statement',
  'protocol',
  'rct',
  'systematic_review',
  'meta_analysis',
  'observational_study',
  'textbook',
  'review',
  'other',
  'unknown',
]);
const VALID_SPECIALTIES = new Set([
  'cardiology',
  'pulmonology',
  'endocrinology',
  'nephrology',
  'gastroenterology',
  'neurology',
  'infectious_disease',
  'oncology',
  'rheumatology',
  'dermatology',
  'hematology',
  'pediatrics',
  'intensive_care',
  'general_internal_medicine',
]);

function getManualMetadataOverrides(): Record<string, any> {
  const metaFile = path.join(storageMetaDir, 'manual_metadata.json');
  if (!fs.existsSync(metaFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
  } catch {
    return {};
  }
}

function saveManualMetadataOverride(docId: string, overrideData: Record<string, any>) {
  const metaFile = path.join(storageMetaDir, 'manual_metadata.json');
  const all = getManualMetadataOverrides();
  all[docId] = {
    ...all[docId],
    ...overrideData,
    document_id: docId,
    classification_source: 'manual_metadata',
    classification_confidence: 1.0,
    classification_metadata: {
      ...(all[docId]?.classification_metadata || {}),
      metadata_mode: 'manual',
      updated_via: 'document_metadata_api',
      updated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(metaFile, JSON.stringify(all, null, 2), 'utf-8');
  return all[docId];
}

function applyMetadataToDoc(doc: any): any {
  if (!doc) return doc;
  const docId = doc.document_id || doc.id || doc.external_id;
  if (!docId) return doc;
  const overrides = getManualMetadataOverrides();
  const override = overrides[docId];
  if (!override) return doc;

  const specialties = override.specialties !== undefined
    ? override.specialties
    : (Array.isArray(doc.specialties) ? doc.specialties : (doc.specialty ? [doc.specialty] : []));

  const primarySpecialty = specialties.length > 0 ? specialties[0] : (override.specialty || doc.specialty || null);

  return {
    ...doc,
    source_authority: override.source_authority !== undefined ? override.source_authority : doc.source_authority,
    document_type: override.document_type || doc.document_type,
    organization: override.organization !== undefined ? override.organization : doc.organization,
    issuing_organization: override.organization !== undefined ? override.organization : (doc.issuing_organization || doc.organization),
    publication_year: override.publication_year !== undefined ? override.publication_year : doc.publication_year,
    language: override.language !== undefined ? override.language : doc.language,
    specialty: primarySpecialty,
    specialties: specialties,
    classification_source: 'manual_metadata',
    classification_confidence: 1.0,
    classification_metadata: override.classification_metadata || doc.classification_metadata || { metadata_mode: 'manual' },
    updated_at: override.updated_at || doc.updated_at || new Date().toISOString(),
  };
}

function validateAndApplyMetadataPatch(
  docId: string,
  body: any
): { success: boolean; status: number; data?: any; message?: string } {
  // Validate source_authority
  let source_authority = undefined;
  if (body.source_authority !== undefined) {
    if (body.source_authority === null || body.source_authority === '') {
      source_authority = null;
    } else {
      const sa = String(body.source_authority).trim().toLowerCase();
      if (!VALID_SOURCE_AUTHORITIES.has(sa)) {
        return {
          success: false,
          status: 400,
          message: `Invalid source_authority: '${body.source_authority}'. Allowed: ${Array.from(VALID_SOURCE_AUTHORITIES).sort().join(', ')}`,
        };
      }
      source_authority = sa;
    }
  }

  // Validate document_type
  let document_type = undefined;
  if (body.document_type !== undefined) {
    if (body.document_type === null || body.document_type === '') {
      document_type = 'unknown';
    } else {
      const dt = String(body.document_type).trim().toLowerCase();
      if (!VALID_DOCUMENT_TYPES.has(dt)) {
        return {
          success: false,
          status: 400,
          message: `Invalid document_type: '${body.document_type}'. Allowed: ${Array.from(VALID_DOCUMENT_TYPES).sort().join(', ')}`,
        };
      }
      document_type = dt;
    }
  }

  // Validate publication_year
  let publication_year = undefined;
  if (body.publication_year !== undefined) {
    if (body.publication_year === null || body.publication_year === '') {
      publication_year = null;
    } else {
      const py = parseInt(String(body.publication_year), 10);
      if (isNaN(py) || py < 1900 || py > 2100) {
        return {
          success: false,
          status: 400,
          message: `Invalid publication_year: '${body.publication_year}'. Must be an integer between 1900 and 2100.`,
        };
      }
      publication_year = py;
    }
  }

  // Validate language
  let language = undefined;
  if (body.language !== undefined) {
    if (body.language === null || body.language === '') {
      language = null;
    } else {
      const lang = String(body.language).trim().toLowerCase();
      if (!['vi', 'en', 'other'].includes(lang)) {
        return {
          success: false,
          status: 400,
          message: `Invalid language: '${body.language}'. Allowed: 'vi', 'en', 'other'.`,
        };
      }
      language = lang;
    }
  }

  // Validate organization
  let organization = undefined;
  if (body.organization !== undefined) {
    const org = String(body.organization || '').trim();
    organization = org ? org : null;
  }

  // Validate specialties
  let specialties: string[] | undefined = undefined;
  let specialty: string | null | undefined = undefined;
  if (body.specialties !== undefined) {
    if (Array.isArray(body.specialties)) {
      const validated: string[] = [];
      for (const s of body.specialties) {
        const code = String(s || '').trim().toLowerCase();
        if (!code) continue;
        if (!VALID_SPECIALTIES.has(code)) {
          return {
            success: false,
            status: 400,
            message: `Invalid specialty code: '${s}'. Allowed codes: ${Array.from(VALID_SPECIALTIES).sort().join(', ')}`,
          };
        }
        if (!validated.includes(code)) validated.push(code);
      }
      specialties = validated;
      specialty = validated.length > 0 ? validated[0] : null;
    } else {
      specialties = [];
      specialty = null;
    }
  } else if (body.specialty !== undefined) {
    const sp = String(body.specialty || '').trim().toLowerCase();
    if (sp) {
      if (!VALID_SPECIALTIES.has(sp)) {
        return {
          success: false,
          status: 400,
          message: `Invalid specialty code: '${body.specialty}'. Allowed codes: ${Array.from(VALID_SPECIALTIES).sort().join(', ')}`,
        };
      }
      specialties = [sp];
      specialty = sp;
    } else {
      specialties = [];
      specialty = null;
    }
  }

  const patchData: Record<string, any> = {};
  if (source_authority !== undefined) patchData.source_authority = source_authority;
  if (document_type !== undefined) patchData.document_type = document_type;
  if (publication_year !== undefined) patchData.publication_year = publication_year;
  if (language !== undefined) patchData.language = language;
  if (organization !== undefined) patchData.organization = organization;
  if (specialties !== undefined) patchData.specialties = specialties;
  if (specialty !== undefined) patchData.specialty = specialty;

  // Persist to manual_metadata.json
  const savedOverride = saveManualMetadataOverride(docId, patchData);

  // Update in documents.json if present
  const docFile = path.join(storageMetaDir, 'documents.json');
  let docObj: any = { document_id: docId, file_name: `${docId}.pdf`, status: 'completed' };
  if (fs.existsSync(docFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(docFile, 'utf-8'));
      if (data[docId]) {
        data[docId] = { ...data[docId], ...savedOverride };
        docObj = data[docId];
        fs.writeFileSync(docFile, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch {}
  }

  // Update in canonical artifact output/{docId}/document.json if exists
  const canonicalDocJson = path.join(outputDir, docId, 'document.json');
  if (fs.existsSync(canonicalDocJson)) {
    try {
      const canonicalData = JSON.parse(fs.readFileSync(canonicalDocJson, 'utf-8'));
      const mergedCanonical = { ...canonicalData, ...savedOverride };
      fs.writeFileSync(canonicalDocJson, JSON.stringify(mergedCanonical, null, 2), 'utf-8');
    } catch {}
  }

  return {
    success: true,
    status: 200,
    data: applyMetadataToDoc(docObj),
  };
}

function proxyRequestHandler(req: express.Request, res: express.Response) {
  try {
    const targetPath = req.originalUrl.replace(/^\/api\/proxy/, '') || '/';

    // Intercept taxonomy endpoints
    if (req.method === 'GET') {
      if (targetPath === '/specialties' || targetPath === '/specialties/') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(CANONICAL_SPECIALTIES);
        return;
      }
      if (targetPath === '/source-authorities' || targetPath === '/source-authorities/') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(CANONICAL_SOURCE_AUTHORITIES);
        return;
      }
    }

    // Intercept PATCH /documents/:id/metadata
    const patchMetaMatch = targetPath.match(/^\/documents\/([a-zA-Z0-9_-]+)\/metadata\/?$/);
    if (req.method === 'PATCH' && patchMetaMatch) {
      const docId = patchMetaMatch[1];
      let rawBody = '';
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        let body: any = {};
        try {
          if (rawBody.trim()) body = JSON.parse(rawBody);
        } catch {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.status(400).json({ error: 'Invalid JSON body' });
          return;
        }

        const result = validateAndApplyMetadataPatch(docId, body);
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (!result.success) {
          res.status(result.status).json({ detail: result.message, error: result.message });
        } else {
          res.status(200).json(result.data);
        }
      });
      return;
    }

    const parsedBase = new URL(TARGET_BACKEND_URL);
    const combinedPath = (parsedBase.pathname.replace(/\/+$/, '') + targetPath).replace(/\/{2,}/g, '/');
    const targetUrl = new URL(combinedPath, parsedBase.origin);

    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const upstreamHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      // Omit hop-by-hop headers and host header
      if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(lowerKey)) {
        continue;
      }
      if (value !== undefined) {
        upstreamHeaders[key] = value;
      }
    }

    // Always inject server-side API credentials (securely kept on server)
    if (TARGET_API_KEY) {
      upstreamHeaders['x-api-key'] = TARGET_API_KEY;
    }
    if (process.env.KNOWLEDGE_API_BEARER_TOKEN && !upstreamHeaders['authorization']) {
      upstreamHeaders['authorization'] = `Bearer ${process.env.KNOWLEDGE_API_BEARER_TOKEN}`;
    }

    const upstreamReq = client.request(
      targetUrl,
      {
        method: req.method,
        headers: upstreamHeaders,
        timeout: 300000, // 5 minutes timeout for large file uploads
      },
      (upstreamRes) => {
        // If request is DELETE, always ensure local disk/meta is cleaned up regardless of upstream response
        if (req.method === 'DELETE') {
          if (targetPath === '/documents/failed' || targetPath === '/documents/failed/') {
            const report = deleteFailedDocumentsLocally();
            if (upstreamRes.statusCode && upstreamRes.statusCode >= 400) {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.status(200).json(report);
              return;
            }
          }
          const docIdMatch = targetPath.match(/^\/documents\/([a-zA-Z0-9_-]+)$/);
          if (docIdMatch) {
            const docId = docIdMatch[1];
            const result = deleteDocumentLocally(docId, true);
            if (upstreamRes.statusCode && upstreamRes.statusCode >= 400) {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.status(200).json({
                success: true,
                document_id: docId,
                message: result.message || `Document ${docId} deleted.`,
              });
              return;
            }
          }
        }

        // For GET /documents or GET /documents/:id, merge manual metadata overrides if available
        const isDocList = req.method === 'GET' && (targetPath === '/documents' || targetPath === '/documents/');
        const isSingleDoc = req.method === 'GET' && /^\/documents\/[a-zA-Z0-9_-]+$/.test(targetPath);

        if ((isDocList || isSingleDoc) && (upstreamRes.statusCode === 200 || !upstreamRes.statusCode)) {
          let responseBody = '';
          upstreamRes.on('data', (chunk) => {
            responseBody += chunk;
          });
          upstreamRes.on('end', () => {
            try {
              const parsed = JSON.parse(responseBody);
              let transformed = parsed;
              if (Array.isArray(parsed)) {
                transformed = parsed.map(applyMetadataToDoc);
              } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.documents)) {
                  transformed = { ...parsed, documents: parsed.documents.map(applyMetadataToDoc) };
                } else {
                  transformed = applyMetadataToDoc(parsed);
                }
              }
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Content-Type', 'application/json');
              res.status(upstreamRes.statusCode || 200).send(JSON.stringify(transformed));
            } catch {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.status(upstreamRes.statusCode || 200).send(responseBody);
            }
          });
          return;
        }

        // Forward upstream status code
        res.status(upstreamRes.statusCode || 200);

        // Forward response headers
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          const lowerKey = key.toLowerCase();
          if (['connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(lowerKey)) {
            continue;
          }
          if (value !== undefined) {
            res.setHeader(key, value);
          }
        }
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Pipe upstream response byte-for-byte directly to client response
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on('error', (err: any) => {
      console.error(`[Proxy Error] ${req.method} ${req.originalUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Cannot connect to Document Management API on VPS.',
          detail: err.message,
          status: 502,
        });
      }
    });

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy(new Error('Proxy request to upstream timed out'));
    });

    // Pipe untouched incoming request stream byte-for-byte to upstream
    req.pipe(upstreamReq);
  } catch (err: any) {
    console.error(`[Proxy Setup Error] ${req.method} ${req.originalUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy setup error',
        detail: err.message,
        status: 500,
      });
    }
  }
}

// Register proxy routes BEFORE express.json()
app.all('/api/proxy/*', proxyRequestHandler);
app.all('/api/proxy', proxyRequestHandler);

// Body parser for local (non-proxy) endpoints only
app.use(express.json());

// Local endpoints
app.get('/api/specialties', (_req, res) => {
  res.json(CANONICAL_SPECIALTIES);
});

app.get('/api/source-authorities', (_req, res) => {
  res.json(CANONICAL_SOURCE_AUTHORITIES);
});

app.patch('/api/documents/:id/metadata', (req, res) => {
  const docId = req.params.id;
  const result = validateAndApplyMetadataPatch(docId, req.body);
  if (!result.success) {
    res.status(result.status).json({ detail: result.message, error: result.message });
  } else {
    res.status(200).json(result.data);
  }
});


const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, inputDir),
    filename: (_req, file, cb) => {
      // Keep original name or sanitize
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, sanitized);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Helper to read document repository
function getDocumentsFromRepo(): any[] {
  const docFile = path.join(storageMetaDir, 'documents.json');
  if (!fs.existsSync(docFile)) return [];
  try {
    const raw = fs.readFileSync(docFile, 'utf-8');
    const data = JSON.parse(raw);
    return Object.values(data);
  } catch (err) {
    console.error('Error reading documents.json:', err);
    return [];
  }
}

// Helper to read full canonical document
function getCanonicalDocument(docId: string): any | null {
  const docDir = path.join(outputDir, docId);
  if (!fs.existsSync(docDir)) {
    // Check if doc exists in repository
    const docs = getDocumentsFromRepo();
    const doc = docs.find((d: any) => d.document_id === docId);
    if (!doc) return null;
    return {
      document: doc,
      sections: [],
      semantic_units: [],
      validation_summary: { is_valid: false, status: 'NO_CANONICAL_OUTPUT', errors: ['Canonical output directory missing'] },
    };
  }

  try {
    const docMeta = fs.existsSync(path.join(docDir, 'document.json'))
      ? JSON.parse(fs.readFileSync(path.join(docDir, 'document.json'), 'utf-8'))
      : null;
    const sections = fs.existsSync(path.join(docDir, 'sections.json'))
      ? JSON.parse(fs.readFileSync(path.join(docDir, 'sections.json'), 'utf-8'))
      : [];
    const semanticUnits = fs.existsSync(path.join(docDir, 'semantic_units.json'))
      ? JSON.parse(fs.readFileSync(path.join(docDir, 'semantic_units.json'), 'utf-8'))
      : [];
    const processing = fs.existsSync(path.join(docDir, 'processing.json'))
      ? JSON.parse(fs.readFileSync(path.join(docDir, 'processing.json'), 'utf-8'))
      : null;

    return {
      document: docMeta,
      sections,
      semantic_units: semanticUnits,
      validation_summary: processing?.validation_summary || { is_valid: true, status: 'PASS', errors: [], warnings: [] },
    };
  } catch (err) {
    console.error(`Error loading canonical doc ${docId}:`, err);
    return null;
  }
}

// Helper to hard delete a document
function deleteDocumentLocally(docId: string, force = true): { success: boolean; status: number; message: string } {
  const docsFile = path.join(storageMetaDir, 'documents.json');
  const jobsFile = path.join(storageMetaDir, 'jobs.json');

  if (!fs.existsSync(docsFile)) {
    return { success: false, status: 404, message: `Document ${docId} not found.` };
  }

  let docsData: Record<string, any> = {};
  try {
    docsData = JSON.parse(fs.readFileSync(docsFile, 'utf-8'));
  } catch {
    return { success: false, status: 500, message: 'Failed to read documents.json' };
  }

  // Look for exact key match or inside records
  let matchedKey = docsData[docId] ? docId : null;
  if (!matchedKey) {
    matchedKey = Object.keys(docsData).find((k) => {
      const d = docsData[k];
      return (
        k === docId ||
        k === `doc_${docId}` ||
        `doc_${k}` === docId ||
        d.document_id === docId ||
        d.file_hash === docId ||
        d.file_name === docId ||
        d.id === docId
      );
    }) || null;
  }

  const doc = matchedKey ? docsData[matchedKey] : null;
  const targetId = matchedKey || docId;

  // 1. Delete raw file & storage directory
  const rawDir = path.join(__dirname, 'storage_data', 'raw', targetId);
  if (fs.existsSync(rawDir)) {
    try {
      fs.rmSync(rawDir, { recursive: true, force: true });
    } catch {}
  }
  if (doc?.storage_path) {
    const fullStoragePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, 'storage_data', doc.storage_path);
    if (fs.existsSync(fullStoragePath)) {
      try {
        fs.rmSync(fullStoragePath, { force: true });
      } catch {}
    }
  }

  // 2. Delete input file copies if any
  try {
    if (fs.existsSync(inputDir)) {
      const inputFiles = fs.readdirSync(inputDir);
      for (const f of inputFiles) {
        if (f.startsWith(`${targetId}_`) || (doc?.file_name && f === doc.file_name)) {
          fs.rmSync(path.join(inputDir, f), { force: true });
        }
      }
    }
  } catch {}

  // 3. Delete canonical output directory
  const canonicalDir = path.join(outputDir, targetId);
  if (fs.existsSync(canonicalDir)) {
    try {
      fs.rmSync(canonicalDir, { recursive: true, force: true });
    } catch {}
  }

  // 4. Delete jobs associated with document
  if (fs.existsSync(jobsFile)) {
    try {
      const jobsData = JSON.parse(fs.readFileSync(jobsFile, 'utf-8'));
      let jobsChanged = false;
      for (const [k, v] of Object.entries(jobsData)) {
        if ((v as any)?.document_id === targetId || (v as any)?.document_id === docId) {
          delete jobsData[k];
          jobsChanged = true;
        }
      }
      if (jobsChanged) {
        fs.writeFileSync(jobsFile, JSON.stringify(jobsData, null, 2), 'utf-8');
      }
    } catch {}
  }

  // 5. Delete document record from documents.json
  if (matchedKey) {
    delete docsData[matchedKey];
    fs.writeFileSync(docsFile, JSON.stringify(docsData, null, 2), 'utf-8');
  }

  return { success: true, status: 200, message: `Document ${docId} permanently deleted.` };
}

// Helper to hard delete all failed documents
function deleteFailedDocumentsLocally(): {
  deleted_count: number;
  deleted_documents: string[];
  storage_deleted: number;
  errors: any[];
} {
  const docsFile = path.join(storageMetaDir, 'documents.json');
  if (!fs.existsSync(docsFile)) {
    return { deleted_count: 0, deleted_documents: [], storage_deleted: 0, errors: [] };
  }
  let docsData: Record<string, any> = {};
  try {
    docsData = JSON.parse(fs.readFileSync(docsFile, 'utf-8'));
  } catch {
    return { deleted_count: 0, deleted_documents: [], storage_deleted: 0, errors: [{ error: 'Could not read documents.json' }] };
  }

  const failedDocIds = Object.keys(docsData).filter((id) => {
    const d = docsData[id];
    return (
      d.processing_status === 'failed' ||
      d.status === 'failed' ||
      Boolean(d.error_message) ||
      d.is_valid === false ||
      d.file_name?.toLowerCase().includes('corrupt') ||
      d.file_name?.toLowerCase().includes('failed')
    );
  });

  const deleted_documents: string[] = [];
  const errors: any[] = [];

  for (const id of failedDocIds) {
    const res = deleteDocumentLocally(id, true);
    if (res.success) {
      deleted_documents.push(id);
    } else {
      errors.push({ document_id: id, error: res.message, status: res.status });
    }
  }

  return {
    deleted_count: deleted_documents.length,
    deleted_documents,
    storage_deleted: deleted_documents.length,
    errors,
  };
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Medical Knowledge Engine',
    version: '1.0.0',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/stats', (_req, res) => {
  const docs = getDocumentsFromRepo();
  const total = docs.length;
  const completed = docs.filter((d: any) => d.processing_status === 'completed').length;
  const duplicate = docs.filter((d: any) => d.processing_status === 'duplicate').length;
  const failed = docs.filter((d: any) => d.processing_status === 'failed').length;
  const processing = docs.filter((d: any) => ['discovered', 'queued', 'classifying', 'parsing', 'validating'].includes(d.processing_status)).length;

  // Specialty & Document Type breakdowns
  const specialties: Record<string, number> = {};
  const docTypes: Record<string, number> = {};
  let totalClinicalMarkers = 0;
  let totalSections = 0;

  docs.forEach((d: any) => {
    if (d.specialty) {
      specialties[d.specialty] = (specialties[d.specialty] || 0) + 1;
    }
    if (d.document_type) {
      docTypes[d.document_type] = (docTypes[d.document_type] || 0) + 1;
    }
  });

  // Count total sections and units across canonical docs
  try {
    const docDirs = fs.readdirSync(outputDir);
    docDirs.forEach((dirName) => {
      const procFile = path.join(outputDir, dirName, 'processing.json');
      if (fs.existsSync(procFile)) {
        try {
          const proc = JSON.parse(fs.readFileSync(procFile, 'utf-8'));
          totalSections += proc.total_sections || 0;
        } catch {}
      }
      const unitsFile = path.join(outputDir, dirName, 'semantic_units.json');
      if (fs.existsSync(unitsFile)) {
        try {
          const units = JSON.parse(fs.readFileSync(unitsFile, 'utf-8'));
          totalClinicalMarkers += units.filter((u: any) => u.classification === 'clinical_marker').length;
        } catch {}
      }
    });
  } catch {}

  res.json({
    total,
    completed,
    duplicate,
    failed,
    processing,
    totalSections,
    totalClinicalMarkers,
    specialties,
    docTypes,
  });
});

app.get('/api/documents', (_req, res) => {
  const docs = getDocumentsFromRepo();
  // Enrich with canonical quick metrics
  const enriched = docs.map((doc: any) => {
    const docDir = path.join(outputDir, doc.document_id);
    let totalSections = 0;
    let totalUnits = 0;
    let isValid = true;

    if (fs.existsSync(path.join(docDir, 'processing.json'))) {
      try {
        const proc = JSON.parse(fs.readFileSync(path.join(docDir, 'processing.json'), 'utf-8'));
        totalSections = proc.total_sections || 0;
        totalUnits = proc.total_semantic_units || 0;
        isValid = proc.validation_summary?.is_valid ?? true;
      } catch {}
    }

    return {
      ...doc,
      total_sections: totalSections,
      total_semantic_units: totalUnits,
      is_valid: isValid,
    };
  });

  // Sort by updated_at descending
  enriched.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
  res.json(enriched);
});

app.get('/api/documents/:id', (req, res) => {
  const docId = req.params.id;
  const canonical = getCanonicalDocument(docId);
  if (!canonical) {
    res.status(404).json({ error: `Document ${docId} not found` });
    return;
  }
  res.json(canonical);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const filePath = req.file.path;
  try {
    // Run python pipeline for this single file
    const cmd = `python3 main.py process "${filePath}"`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname });
    console.log(`Process output for ${req.file.filename}:\n`, stdout);

    // Refresh repo and find the processed document
    const docs = getDocumentsFromRepo();
    const doc = docs.find((d: any) => d.file_name === req.file?.filename || d.file_path === filePath);

    res.json({
      success: true,
      file_name: req.file.filename,
      document: doc,
      output: stdout,
    });
  } catch (err: any) {
    console.error('Error processing uploaded file:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stderr: err.stderr,
    });
  }
});

app.post('/api/batch-ingest', async (_req, res) => {
  try {
    const cmd = `python3 main.py ingest ./input`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname });
    res.json({
      success: true,
      message: 'Batch ingestion executed successfully',
      output: stdout,
      docs: getDocumentsFromRepo(),
    });
  } catch (err: any) {
    console.error('Error running batch ingest:', err);
    res.status(500).json({ success: false, error: err.message, stderr: err.stderr });
  }
});

app.post('/api/retry/:id', async (req, res) => {
  const docId = req.params.id;
  try {
    const cmd = `python3 main.py retry ${docId}`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname });
    const canonical = getCanonicalDocument(docId);
    res.json({
      success: true,
      message: `Document ${docId} retried successfully`,
      output: stdout,
      canonical,
    });
  } catch (err: any) {
    console.error(`Error retrying document ${docId}:`, err);
    res.status(500).json({ success: false, error: err.message, stderr: err.stderr });
  }
});

app.post('/api/generate-samples', async (_req, res) => {
  try {
    const cmd = `python3 create_sample_medical_data.py && python3 main.py ingest ./input`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname });
    res.json({
      success: true,
      message: 'Sample medical documents generated and ingested',
      output: stdout,
      docs: getDocumentsFromRepo(),
    });
  } catch (err: any) {
    console.error('Error generating sample data:', err);
    res.status(500).json({ success: false, error: err.message, stderr: err.stderr });
  }
});

app.delete('/api/documents/failed', (_req, res) => {
  try {
    const report = deleteFailedDocumentsLocally();
    res.json(report);
  } catch (err: any) {
    console.error('Error deleting failed documents:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/documents/:id', (req, res) => {
  const docId = req.params.id;
  try {
    const result = deleteDocumentLocally(docId, true);
    res.status(result.status).json({
      success: result.success,
      document_id: docId,
      message: result.message,
    });
  } catch (err: any) {
    console.error(`Error deleting document ${docId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run-tests', async (_req, res) => {
  try {
    const cmd = `python3 run_tests.py`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname });
    res.json({
      success: true,
      output: stdout || stderr,
    });
  } catch (err: any) {
    res.json({
      success: false,
      output: err.stdout || err.message,
      stderr: err.stderr,
    });
  }
});

app.get('/api/supabase-health', async (_req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mpfncorbosznxjucssaq.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ZV-09LGUJfjVQx8XHGe1HQ_y84AhuA4';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      return res.json({ connected: true, url: supabaseUrl, authHealthy: true });
    }
    return res.json({
      connected: false,
      url: supabaseUrl,
      authHealthy: false,
      error: `Supabase returned HTTP ${response.status}`,
    });
  } catch (err: any) {
    return res.json({
      connected: false,
      url: supabaseUrl,
      authHealthy: false,
      error: err.message || 'Cannot reach Supabase host',
    });
  }
});

// 404 Handler for undefined API routes (ensures API never falls through to HTML index)
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Configure Vite or Static Files
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          res.status(404).send('index.html not found');
        }
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`Medical Knowledge Engine running on port ${PORT}`);
    console.log(`Development Server & API Bridge Active: http://0.0.0.0:${PORT}`);
    console.log(`====================================================`);
  });
}

// Only launch standalone server listener if not deployed as a Vercel Serverless Function
if (!process.env.VERCEL) {
  startServer();
}

export default app;
