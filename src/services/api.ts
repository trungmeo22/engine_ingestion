/**
 * API Services Layer (re-exports and delegates to unified knowledgeApi)
 * No hard-coded domains or secrets.
 */

import {
  BackendDocument,
  HealthCheckResponse,
  UploadResponse,
  RetryResponse,
  DocumentStructureResponse,
  SourceCategory,
  SourceAuthority,
} from '../types';
import {
  getKnowledgeApiBaseUrl,
  getHealth as getKnowledgeHealth,
  listDocuments as getKnowledgeDocuments,
  getDocument as getKnowledgeDocument,
  uploadDocument as uploadKnowledgeDoc,
  retryIngest as retryKnowledgeDoc,
  deleteDocument as deleteKnowledgeDoc,
  deleteFailedDocuments as deleteKnowledgeFailedDocs,
  getDocumentStructure as getKnowledgeDocStructure,
  getSourceCategories as getKnowledgeSourceCategories,
  getSourceAuthorities as getKnowledgeSourceAuthorities,
  DocumentUploadMetadata,
} from '../lib/knowledgeApi';

export const API_BASE_URL = getKnowledgeApiBaseUrl();
export const PROXY_API_BASE = '/api/proxy';

/**
 * Health check delegate
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; data?: HealthCheckResponse }> {
  try {
    const data = await getKnowledgeHealth();
    return { ok: true, data };
  } catch (err: any) {
    console.warn('[API] Health check unreachable:', err.message);
    return { ok: false };
  }
}

/**
 * Fetch documents delegate
 */
export async function fetchDocuments(): Promise<BackendDocument[]> {
  try {
    const docs = await getKnowledgeDocuments();
    return docs as unknown as BackendDocument[];
  } catch (err: any) {
    console.warn('[API] Could not fetch documents from server:', err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Fetch single document delegate
 */
export async function fetchDocumentById(documentId: string): Promise<BackendDocument> {
  try {
    const doc = await getKnowledgeDocument(documentId);
    return doc as unknown as BackendDocument;
  } catch (err: any) {
    console.warn(`[API] Could not fetch document ${documentId}:`, err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Upload document file delegate
 */
export async function uploadDocumentFile(
  file: File,
  metadata?: DocumentUploadMetadata
): Promise<UploadResponse> {
  try {
    const res = await uploadKnowledgeDoc(file, metadata);
    return {
      document_id: res.document_id,
      file_name: res.file_name || file.name,
      status: 'queued',
      job_id: res.job_id,
    };
  } catch (err: any) {
    console.warn('[API] Upload document failed:', err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Retry document delegate
 */
export async function retryDocument(documentId: string): Promise<RetryResponse> {
  try {
    const res = await retryKnowledgeDoc(documentId);
    return {
      document_id: res.document_id,
      status: 'queued',
      job_id: res.job_id,
    };
  } catch (err: any) {
    console.warn(`[API] Retry document ${documentId} failed:`, err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Delete document delegate
 */
export async function deleteDocumentFile(documentId: string): Promise<{ success: boolean; document_id: string }> {
  try {
    return await deleteKnowledgeDoc(documentId);
  } catch (err: any) {
    console.warn(`[API] Delete document ${documentId} failed:`, err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Bulk delete failed documents delegate
 */
export async function deleteFailedDocuments(): Promise<{
  deleted_count: number;
  deleted_documents: string[];
  storage_deleted: number;
  errors: any[];
}> {
  try {
    return await deleteKnowledgeFailedDocs();
  } catch (err: any) {
    console.warn('[API] Delete failed documents failed:', err.message);
    throw new Error(err.message || 'Cannot connect to document processing server.');
  }
}

/**
 * Fetch document structure delegate
 */
export async function fetchDocumentStructure(documentId: string): Promise<DocumentStructureResponse> {
  try {
    return await getKnowledgeDocStructure(documentId);
  } catch (err: any) {
    console.warn(`[API] Could not fetch structure for ${documentId}:`, err.message);
    throw new Error(err.message || 'Unable to load document structure.');
  }
}

/**
 * Source authorities (BYT Vietnam, ESC, other)
 */
export async function fetchSourceAuthorities(): Promise<SourceAuthority[]> {
  try {
    return await getKnowledgeSourceAuthorities();
  } catch {
    return [
      { code: 'other', name: 'Nguồn khác', geographic_scope: 'Other', authority_priority: 40 },
    ];
  }
}

/**
 * Source categories (BYT Vietnam, ESC, ACC/AHA, KDIGO, GOLD, etc.)
 */
export async function fetchSourceCategories(): Promise<SourceCategory[]> {
  try {
    return await getKnowledgeSourceCategories();
  } catch {
    return [
      { code: 'vietnam_moh_guideline', name: 'Bộ Y tế Việt Nam', authority_priority: 100 },
      { code: 'vietnam_national_specialty_guideline', name: 'Khuyến cáo chuyên ngành trong nước', authority_priority: 95 },
      { code: 'vietnam_hospital_protocol', name: 'Phác đồ bệnh viện', authority_priority: 85 },
      { code: 'international_guideline', name: 'Guideline quốc tế', authority_priority: 90 },
      { code: 'international_consensus', name: 'Consensus quốc tế', authority_priority: 80 },
      { code: 'international_rct', name: 'RCT / thử nghiệm lâm sàng', authority_priority: 75 },
    ];
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
