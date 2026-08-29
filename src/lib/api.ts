import {
  BackendDocument,
  CanonicalDocument,
  DashboardStats,
  DocumentRecord,
  RawSection,
  RawSemanticUnit,
  Section,
  SemanticUnit,
  BoundingBox,
  Provenance,
  TableData,
  UnitType,
  UnitClassification,
} from '../types';
import {
  getHealth,
  listDocuments,
  getDocument,
  getDocumentStructure,
  uploadDocument,
  retryIngest,
  startIngest,
  deleteDocument as deleteKnowledgeDocument,
  deleteFailedDocuments as deleteKnowledgeFailed,
} from './knowledgeApi';

const DELETED_DOCS_STORAGE_KEY = 'mke_deleted_doc_ids_v1';

export async function checkBackendHealth(): Promise<{ ok: boolean; data?: any }> {
  try {
    const data = await getHealth();
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export function getDeletedDocIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_DOCS_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveDeletedDocId(docId: string) {
  try {
    const ids = getDeletedDocIds();
    ids.add(docId);
    localStorage.setItem(DELETED_DOCS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function unmarkDeletedDocId(docId: string) {
  try {
    const ids = getDeletedDocIds();
    ids.delete(docId);
    localStorage.setItem(DELETED_DOCS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

function normalizeDocumentRecord(doc: BackendDocument | any): DocumentRecord {
  const status = (doc.processing_status || doc.status || 'queued') as any;
  const specialties = Array.isArray(doc.specialties)
    ? doc.specialties
    : doc.specialty
      ? [String(doc.specialty)]
      : [];
  return {
    ...doc,
    document_id: doc.document_id || doc.id || doc.external_id,
    file_name: doc.file_name || doc.filename || doc.title || 'unnamed.pdf',
    file_path: doc.file_path || '',
    storage_path: doc.storage_path || doc.file_path || '',
    file_extension: String(doc.file_name || doc.filename || '').includes('.')
      ? `.${String(doc.file_name || doc.filename).split('.').pop()}`
      : '.pdf',
    mime_type: doc.mime_type || 'application/pdf',
    file_size: doc.file_size || 0,
    file_hash: doc.file_hash || doc.document_id || '',
    title: doc.title || doc.file_name || doc.filename || 'Untitled',
    document_type: doc.document_type || 'unknown',
    organization: doc.organization || doc.issuing_organization || null,
    issuing_organization: doc.issuing_organization || doc.organization || null,
    publication_year: doc.publication_year || null,
    specialty: specialties[0] || doc.specialty || null,
    specialties,
    topics: Array.isArray(doc.topics) ? doc.topics : [],
    processing_status: status,
    status,
    error_message: doc.error_message || doc.error || null,
    retry_count: doc.retry_count || 0,
    created_at: doc.created_at || new Date().toISOString(),
    updated_at: doc.updated_at || doc.created_at || new Date().toISOString(),
    total_sections: doc.total_sections ?? doc.sections_count ?? doc.section_count ?? 0,
    sections_count: doc.sections_count ?? doc.total_sections ?? doc.section_count ?? 0,
    total_semantic_units: doc.total_semantic_units ?? doc.semantic_units_count ?? doc.semantic_unit_count ?? 0,
    semantic_units_count: doc.semantic_units_count ?? doc.total_semantic_units ?? doc.semantic_unit_count ?? 0,
    is_valid: doc.is_valid ?? status === 'completed',
  };
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const deleted = getDeletedDocIds();
  const docs = await listDocuments();
  return docs.filter((d) => !deleted.has(d.document_id)).map(normalizeDocumentRecord);
}

export async function fetchDashboardStats(documents?: DocumentRecord[]): Promise<DashboardStats> {
  const docs = documents || await fetchDocuments();
  const processingStates = new Set(['queued', 'processing', 'classifying', 'parsing', 'validating', 'retrying']);
  const specialties: Record<string, number> = {};
  const docTypes: Record<string, number> = {};
  let totalSections = 0;
  docs.forEach((d) => {
    if (d.specialty) specialties[d.specialty] = (specialties[d.specialty] || 0) + 1;
    if (d.document_type) docTypes[String(d.document_type)] = (docTypes[String(d.document_type)] || 0) + 1;
    totalSections += d.total_sections || 0;
  });
  return {
    total: docs.length,
    completed: docs.filter((d) => d.processing_status === 'completed').length,
    duplicate: docs.filter((d) => d.processing_status === 'duplicate').length,
    failed: docs.filter((d) => d.processing_status === 'failed').length,
    processing: docs.filter((d) => processingStates.has(d.processing_status)).length,
    totalSections,
    totalClinicalMarkers: 0,
    specialties,
    docTypes,
  };
}

function normalizeSection(raw: RawSection, docId: string, index: number): Section {
  return {
    section_id: String(raw.section_id || raw.id || `sec_${index}`),
    document_id: String(raw.document_id || docId),
    parent_section_id: raw.parent_section_id ? String(raw.parent_section_id) : null,
    title: String(raw.title || `Section ${index + 1}`),
    level: raw.level || 1,
    order_index: raw.order_index ?? raw.section_index ?? index,
    numbering_path: String(raw.numbering_path || raw.numbering || ''),
    breadcrumb: String(raw.breadcrumb || raw.title || ''),
  };
}

function normalizeSemanticUnit(raw: RawSemanticUnit, docId: string, index: number): SemanticUnit {
  const rawBbox: any = raw.bbox || raw.provenance?.bbox;
  let bbox: BoundingBox = { l: 0, t: 0, r: 0, b: 0 };
  if (Array.isArray(rawBbox) && rawBbox.length >= 4) {
    bbox = { l: Number(rawBbox[0]) || 0, t: Number(rawBbox[1]) || 0, r: Number(rawBbox[2]) || 0, b: Number(rawBbox[3]) || 0 };
  } else if (rawBbox && typeof rawBbox === 'object') {
    bbox = {
      l: Number(rawBbox.l ?? rawBbox.left ?? rawBbox.x0 ?? 0),
      t: Number(rawBbox.t ?? rawBbox.top ?? rawBbox.y0 ?? 0),
      r: Number(rawBbox.r ?? rawBbox.right ?? rawBbox.x1 ?? 0),
      b: Number(rawBbox.b ?? rawBbox.bottom ?? rawBbox.y1 ?? 0),
    };
  }
  const provenance: Provenance = {
    document_id: docId,
    file_name: raw.provenance?.file_name || '',
    page: raw.page_number ?? raw.page ?? raw.provenance?.page ?? 1,
    bbox,
    coord_origin: raw.provenance?.coord_origin || 'top-left',
  };
  let tableData: TableData | null = null;
  if (raw.table_data && typeof raw.table_data === 'object') {
    const headers = Array.isArray(raw.table_data.headers) ? raw.table_data.headers.map(String) : [];
    const rows = Array.isArray(raw.table_data.rows)
      ? raw.table_data.rows.map((r: any) => Array.isArray(r) ? r.map(String) : [String(r)])
      : [];
    tableData = {
      headers,
      rows,
      num_rows: raw.table_data.num_rows ?? rows.length,
      num_cols: raw.table_data.num_cols ?? headers.length ?? 0,
    };
  }
  return {
    unit_id: String(raw.unit_id || raw.id || `unit_${index}`),
    document_id: docId,
    section_id: String(raw.section_id || ''),
    unit_type: (raw.unit_type || 'paragraph') as UnitType,
    classification: (raw.classification || 'content') as UnitClassification,
    text_content: String(raw.text_content ?? raw.text ?? raw.content ?? ''),
    order_index: raw.unit_index ?? raw.order_index ?? index,
    provenance,
    breadcrumb: raw.breadcrumb,
    table_data: tableData,
    caption: raw.caption || null,
    parent_unit_id: raw.parent_unit_id || null,
  };
}

export async function fetchCanonicalDocument(docId: string): Promise<CanonicalDocument | null> {
  const [doc, structure] = await Promise.all([
    getDocument(docId),
    getDocumentStructure(docId),
  ]);
  const record = normalizeDocumentRecord(doc as any);
  const sections = (structure.sections || []).map((s, i) => normalizeSection(s, docId, i));
  const semanticUnits = (structure.semantic_units || []).map((u, i) => normalizeSemanticUnit(u, docId, i));
  return {
    document: record,
    sections,
    semantic_units: semanticUnits,
    validation_summary: {
      is_valid: record.is_valid !== false,
      status: record.is_valid === false ? 'FAILED' : 'PASS',
      errors: record.error_message ? [record.error_message] : [],
      warnings: [],
      total_errors: record.error_message ? 1 : 0,
      total_warnings: 0,
    },
  };
}

export async function retryDocument(docId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await retryIngest(docId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Retry failed' };
  }
}

export async function reprocessDocument(docId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await startIngest(docId);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Reprocess failed' };
  }
}

export async function deleteDocument(docId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await deleteKnowledgeDocument(docId);
    if (res.success) saveDeletedDocId(docId);
    return { success: res.success };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Delete failed' };
  }
}

export async function deleteFailedDocuments(): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteKnowledgeFailed();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Delete failed' };
  }
}

export async function batchIngest(): Promise<{ success: boolean; output?: string; error?: string }> {
  return { success: false, error: 'Batch ingest from server filesystem is unavailable in Vercel mode.' };
}

export async function runTests(): Promise<{ success: boolean; output?: string; error?: string }> {
  return { success: false, error: 'Server-side pytest is unavailable in Vercel mode.' };
}

export { uploadDocument };
