import {
  DocumentItem,
  DocumentMetadataPatch,
  DocumentStructureResponse,
  HealthCheckResponse,
  IngestJob,
  JobFilter,
  SourceAuthority,
  SourceCategory,
  SpecialtyItem,
  UploadDocumentResponse,
} from '../types';

export const CANONICAL_SPECIALTIES: SpecialtyItem[] = [
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

export interface DocumentUploadMetadata {
  source_authority?: string;
  document_type?: string;
  publication_year?: number | string | null;
  language?: string | null;
  title?: string;
  source?: string;
  tags?: string[];
}

export function getKnowledgeApiBaseUrl(): string {
  const env = (import.meta as any).env || {};
  const explicit = env.VITE_KNOWLEDGE_API_BASE_URL || env.VITE_API_BASE_URL || '';
  return explicit && String(explicit).trim()
    ? String(explicit).trim().replace(/\/+$/, '')
    : '/api/proxy';
}

function buildRequestUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = getKnowledgeApiBaseUrl();

  if (base === '/api/proxy') {
    return `/api/proxy?path=${encodeURIComponent(normalizedEndpoint)}`;
  }

  return `${base}${normalizedEndpoint}`;
}

async function request(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(buildRequestUrl(endpoint), options);
  return response;
}

async function json<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  let payload: any = null;
  try {
    payload = contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const msg =
      (payload && typeof payload === 'object' && (payload.detail || payload.error || payload.message)) ||
      (typeof payload === 'string' ? payload : '') ||
      `API request failed (${response.status})`;
    throw new Error(Array.isArray(msg) ? JSON.stringify(msg) : String(msg));
  }
  return payload as T;
}

export function sanitizeStorageFilename(rawName: string): string {
  const clean = (rawName || 'document.pdf').replace(/["/\\]/g, '');
  const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.pdf';
  const base = extMatch ? clean.slice(0, -extMatch[0].length) : clean;
  const ascii = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${ascii || 'document'}${ext}`;
}

export function normalizeDocumentItem(doc: any, fallbackId = ''): DocumentItem {
  const id = doc?.document_id || doc?.id || doc?.external_id || fallbackId;
  const fileName = doc?.file_name || doc?.filename || doc?.title || 'unnamed.pdf';
  const status = doc?.processing_status || doc?.status || 'uploaded';
  const specialties = Array.isArray(doc?.specialties)
    ? doc.specialties
    : doc?.specialty
      ? [String(doc.specialty)]
      : [];
  return {
    ...doc,
    id: doc?.id || id,
    external_id: doc?.external_id || id,
    document_id: id,
    title: doc?.title || fileName,
    filename: fileName,
    file_name: fileName,
    status,
    processing_status: status,
    created_at: doc?.created_at || new Date().toISOString(),
    updated_at: doc?.updated_at || doc?.created_at || new Date().toISOString(),
    sections_count: doc?.sections_count ?? doc?.section_count ?? doc?.total_sections ?? 0,
    total_sections: doc?.total_sections ?? doc?.sections_count ?? doc?.section_count ?? 0,
    semantic_units_count: doc?.semantic_units_count ?? doc?.semantic_unit_count ?? doc?.total_semantic_units ?? 0,
    total_semantic_units: doc?.total_semantic_units ?? doc?.semantic_units_count ?? doc?.semantic_unit_count ?? 0,
    specialties,
    specialty: specialties[0] || doc?.specialty || null,
    error: doc?.error || doc?.error_message || null,
    error_message: doc?.error_message || doc?.error || null,
  };
}

export async function getHealth(): Promise<HealthCheckResponse> {
  return json<HealthCheckResponse>(await request('/health', { method: 'GET' }));
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const data = await json<any>(await request('/documents', { method: 'GET' }));
  const docs = Array.isArray(data) ? data : data?.documents || [];
  return docs.map((d: any) => normalizeDocumentItem(d));
}

export async function getDocument(documentId: string): Promise<DocumentItem> {
  const data = await json<any>(await request(`/documents/${encodeURIComponent(documentId)}`));
  return normalizeDocumentItem(data, documentId);
}

export async function updateDocumentMetadata(documentId: string, patch: DocumentMetadataPatch): Promise<DocumentItem> {
  const data = await json<any>(await request(`/documents/${encodeURIComponent(documentId)}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }));
  return normalizeDocumentItem(data, documentId);
}

export async function uploadDocument(file: File, metadata?: DocumentUploadMetadata): Promise<UploadDocumentResponse> {
  if (!file) throw new Error('Please select a file to upload.');
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (ext !== '.pdf' && file.type !== 'application/pdf') throw new Error('Only PDF documents are supported.');
  if (file.size > 100 * 1024 * 1024) throw new Error('File size exceeds the 100MB limit.');

  const form = new FormData();
  form.append('file', file, sanitizeStorageFilename(file.name));
  form.append('source_authority', metadata?.source_authority?.trim() || 'other');
  form.append('document_type', metadata?.document_type?.trim() || 'unknown');
  if (metadata?.publication_year != null && String(metadata.publication_year).trim()) {
    form.append('publication_year', String(metadata.publication_year));
  }
  if (metadata?.language) form.append('language', metadata.language);
  if (metadata?.title) form.append('title', metadata.title);

  const res = await json<any>(await request('/documents/upload', { method: 'POST', body: form }));
  const documentId = res?.document_id || res?.external_id || res?.id || res?.data?.document_id;
  if (!documentId) throw new Error(res?.detail || res?.error || res?.message || 'Server did not return a document ID.');
  return {
    document_id: documentId,
    external_id: res?.external_id || documentId,
    job_id: res?.job_id || res?.active_job_id,
    status: res?.status || 'queued',
    file_name: res?.file_name || file.name,
  };
}

export async function startIngest(documentId: string): Promise<{ document_id: string; job_id: string; status: string }> {
  const res = await json<any>(await request(`/documents/${encodeURIComponent(documentId)}/ingest`, { method: 'POST' }));
  return { document_id: res?.document_id || documentId, job_id: res?.job_id || '', status: res?.status || 'queued' };
}

export async function retryIngest(documentId: string): Promise<{ document_id: string; job_id: string; status: string }> {
  const res = await json<any>(await request(`/documents/${encodeURIComponent(documentId)}/retry`, { method: 'POST' }));
  return { document_id: res?.document_id || documentId, job_id: res?.job_id || '', status: res?.status || 'queued' };
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; document_id: string; message?: string }> {
  const response = await request(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  if (response.status === 204) return { success: true, document_id: documentId };
  const res = await json<any>(response);
  return { success: res?.success !== false, document_id: res?.document_id || documentId, message: res?.message };
}

export async function deleteFailedDocuments(): Promise<{ deleted_count: number; deleted_documents: string[]; storage_deleted: number; errors: any[] }> {
  const res = await json<any>(await request('/documents/failed', { method: 'DELETE' }));
  return {
    deleted_count: res?.deleted_count ?? res?.deleted_documents?.length ?? 0,
    deleted_documents: res?.deleted_documents || [],
    storage_deleted: res?.storage_deleted ?? 0,
    errors: res?.errors || [],
  };
}

export async function listJobs(filters?: JobFilter): Promise<IngestJob[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.document_id) params.set('document_id', filters.document_id);
  const suffix = params.toString() ? `?${params}` : '';
  const data = await json<any>(await request(`/jobs${suffix}`));
  const jobs = Array.isArray(data) ? data : data?.jobs || [];
  return jobs.map((j: any) => ({
    job_id: j.job_id || j.id || '',
    document_id: j.document_id || '',
    status: j.status || 'queued',
    stage: j.stage,
    created_at: j.created_at || new Date().toISOString(),
    started_at: j.started_at || null,
    finished_at: j.finished_at || null,
    error: j.error || j.error_message || null,
  }));
}

export async function getJob(jobId: string): Promise<IngestJob> {
  const j = await json<any>(await request(`/jobs/${encodeURIComponent(jobId)}`));
  return {
    job_id: j?.job_id || j?.id || jobId,
    document_id: j?.document_id || '',
    status: j?.status || 'queued',
    stage: j?.stage,
    created_at: j?.created_at || new Date().toISOString(),
    started_at: j?.started_at || null,
    finished_at: j?.finished_at || null,
    error: j?.error || j?.error_message || null,
  };
}

export async function pollJobUntilFinished(
  jobId: string,
  onUpdate?: (job: IngestJob) => void,
  intervalMs = 2500,
  maxDurationMs = 30 * 60 * 1000,
): Promise<IngestJob> {
  const started = Date.now();
  while (true) {
    const job = await getJob(jobId);
    onUpdate?.(job);
    if (['completed', 'failed'].includes(String(job.status).toLowerCase())) return job;
    if (Date.now() - started > maxDurationMs) throw new Error(`Polling timed out for job ${jobId}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function getDocumentStructure(documentId: string): Promise<DocumentStructureResponse> {
  return json<DocumentStructureResponse>(await request(`/documents/${encodeURIComponent(documentId)}/structure`));
}

export async function listSpecialties(): Promise<SpecialtyItem[]> {
  try {
    const data = await json<any>(await request('/specialties'));
    return Array.isArray(data) ? data : data?.specialties || CANONICAL_SPECIALTIES;
  } catch {
    return CANONICAL_SPECIALTIES;
  }
}

export async function getSourceAuthorities(): Promise<SourceAuthority[]> {
  try {
    const data = await json<any>(await request('/source-authorities'));
    return Array.isArray(data) ? data : data?.source_authorities || data?.authorities || [];
  } catch {
    return [{ code: 'other', name: 'Nguồn khác', geographic_scope: 'Other', authority_priority: 40 }];
  }
}

export async function getSourceCategories(): Promise<SourceCategory[]> {
  try {
    const data = await json<any>(await request('/source-categories'));
    return Array.isArray(data) ? data : data?.source_categories || data?.categories || [];
  } catch {
    return [];
  }
}
