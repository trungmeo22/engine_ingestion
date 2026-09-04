export type ProcessingStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'uploaded'
  | 'discovered'
  | 'classifying'
  | 'parsing'
  | 'validating'
  | 'duplicate'
  | 'retrying';

export interface HealthCheckResponse {
  status: string;
  worker?: string;
  parser_only_ingest?: boolean;
  service?: string;
  supabase?: string;
  source_categories?: number;
}

export interface IngestJob {
  job_id: string;
  document_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  stage?: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}

export interface JobFilter {
  status?: string;
  document_id?: string;
}

export interface UploadDocumentResponse {
  document_id: string;
  external_id?: string;
  job_id?: string;
  status: 'queued' | 'uploaded' | 'processing' | string;
  file_name?: string;
}

export interface UploadResponse {
  document_id: string;
  file_name: string;
  status: 'queued';
  job_id?: string;
}

export interface RetryResponse {
  document_id: string;
  status: 'queued';
  job_id?: string;
}

export interface DocumentItem {
  id?: string;
  external_id?: string;
  document_id: string;
  title?: string;
  filename?: string;
  file_name?: string;
  status?: 'completed' | 'processing' | 'failed' | 'uploaded' | 'queued' | ProcessingStatus;
  processing_status?: ProcessingStatus;
  created_at: string;
  updated_at: string;
  page_count?: number;
  section_count?: number;
  sections_count?: number;
  total_sections?: number;
  semantic_unit_count?: number;
  semantic_units_count?: number;
  total_semantic_units?: number;
  active_job_id?: string | null;
  error?: string | null;
  error_message?: string | null;
  file_size?: number;
  file_hash?: string;
  document_type?: string;
  organization?: string | null;
  issuing_organization?: string | null;
  publication_year?: number | null;
  specialty?: string | null;
  specialties?: string[];
  age_group?: string | null;
  official_title?: string | null;
  topics?: string[];
  source_country?: string | null;
  country?: string | null;
  classification_confidence?: number | null;
  classification_source?: string | null;
  classification_metadata?: Record<string, any>;
  source_category?: string | null;
  source_authority?: string | null;
  language?: string | null;
  is_valid?: boolean;
}

export interface BackendDocument {
  id?: string;
  external_id?: string;
  document_id: string;
  file_name: string;
  filename?: string;
  file_path?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'uploaded' | ProcessingStatus;
  processing_status?: ProcessingStatus;
  error_message?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
  title?: string;
  document_type?: string;
  organization?: string | null;
  issuing_organization?: string | null;
  publication_year?: number | null;
  specialty?: string | null;
  specialties?: string[];
  age_group?: string | null;
  official_title?: string | null;
  topics?: string[];
  source_country?: string | null;
  country?: string | null;
  classification_confidence?: number | null;
  classification_source?: string | null;
  classification_metadata?: Record<string, any>;
  document_sources?: string | string[] | any;
  sources?: string | string[] | any;
  source_category?: string | null;
  source_authority?: string | null;
  language?: string | null;
  file_size?: number;
  file_hash?: string;
  page_count?: number;
  section_count?: number;
  total_sections?: number;
  sections_count?: number;
  semantic_unit_count?: number;
  total_semantic_units?: number;
  semantic_units_count?: number;
  active_job_id?: string | null;
  is_valid?: boolean;
}

export interface SourceAuthority {
  code: string;
  name: string;
  geographic_scope?: string | null;
  authority_priority?: number;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SourceCategory {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  geographic_scope?: string | null;
  authority_priority?: number;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RawSection {
  section_id?: string;
  id?: string;
  document_id?: string;
  parent_section_id?: string | null;
  title?: string;
  level?: number;
  order_index?: number;
  section_index?: number;
  numbering_path?: string;
  numbering?: string;
  breadcrumb?: string;
}

export interface RawSemanticUnit {
  unit_id?: string;
  id?: string;
  unit_index?: number;
  order_index?: number;
  unit_type?: string;
  classification?: string;
  text?: string;
  text_content?: string;
  content?: string;
  table_data?: TableData | null;
  section_id?: string;
  heading_level?: number;
  breadcrumb?: string;
  page_number?: number;
  page?: number;
  bbox?: BoundingBox | [number, number, number, number] | null | any;
  provenance?: Provenance | any;
  caption?: string | null;
  parent_unit_id?: string | null;
}

export interface DocumentStructureResponse {
  document_id: string;
  sections_count: number;
  semantic_units_count: number;
  sections: RawSection[];
  semantic_units: RawSemanticUnit[];
}

export type CanonicalDocumentType =
  | 'guideline'
  | 'consensus'
  | 'position_statement'
  | 'protocol'
  | 'rct'
  | 'systematic_review'
  | 'meta_analysis'
  | 'observational_study'
  | 'textbook'
  | 'review'
  | 'other'
  | 'unknown';

export type DocumentType =
  | CanonicalDocumentType
  | 'RCT'
  | string;

export interface BoundingBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Provenance {
  document_id: string;
  file_name: string;
  page: number;
  bbox: BoundingBox;
  coord_origin: string;
}

export interface Section {
  section_id: string;
  document_id: string;
  parent_section_id: string | null;
  title: string;
  level: number;
  order_index: number;
  numbering_path: string;
  breadcrumb: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  num_rows: number;
  num_cols: number;
}

export type UnitType =
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'table'
  | 'figure'
  | 'footnote'
  | 'caption'
  | 'disclaimer';

export type UnitClassification =
  | 'content'
  | 'clinical_marker'
  | 'metadata'
  | 'navigation'
  | 'disclaimer';

export interface SemanticUnit {
  unit_id: string;
  document_id: string;
  section_id: string;
  unit_type: UnitType;
  classification: UnitClassification;
  text_content: string;
  order_index: number;
  provenance: Provenance;
  breadcrumb?: string;
  table_data?: TableData | null;
  caption?: string | null;
  parent_unit_id?: string | null;
}

export interface ValidationSummary {
  is_valid: boolean;
  status: string;
  errors: string[];
  warnings: string[];
  total_errors: number;
  total_warnings: number;
}

export interface SpecialtyItem {
  code: string;
  name: string;
  description?: string;
}

export interface DocumentMetadataPatch {
  source_authority?: string | null;
  document_type?: string;
  organization?: string | null;
  publication_year?: number | null;
  language?: string | null;
  specialties?: string[];
  specialty?: string | null;
  /**
   * The patient population the guideline is written for. A different axis from
   * specialty, which names the disease domain and says nothing about who the
   * guideline is for. Retrieval drops a document tagged for a population the
   * question did not ask about, so a wrong value costs more than an empty one.
   */
  age_group?: string | null;
  /**
   * The title the document states on its own opening pages, as opposed to
   * `title`, which is the file name. Retrieval scores a document partly on
   * this, and the Ministry's file names cannot match a Vietnamese question.
   */
  official_title?: string | null;
}

export interface DocumentMetadata {
  title: string;
  authors: string[];
  organization: string | null;
  publication_year: number | null;
  version: string | null;
  language: string;
  specialty: string | null;
  specialties?: string[];
  topics: string[];
  document_type: DocumentType;
  confidence: number;
  needs_llm_classification: boolean;
  evidence_signals: string[];
}

export interface DocumentRecord {
  id?: string;
  external_id?: string;
  document_id: string;
  file_name: string;
  filename?: string;
  file_path: string;
  storage_path: string;
  file_extension: string;
  mime_type: string;
  file_size: number;
  file_hash: string;
  title: string;
  document_type: DocumentType;
  organization?: string | null;
  issuing_organization?: string | null;
  publication_year?: number | null;
  source_country?: string | null;
  country?: string | null;
  classification_confidence?: number | null;
  classification_source?: string | null;
  classification_metadata?: Record<string, any>;
  document_sources?: string | string[] | any;
  sources?: string | string[] | any;
  source_category?: string | null;
  source_authority?: string | null;
  language?: string | null;
  version?: string | null;
  specialty?: string | null;
  specialties?: string[];
  topics?: string[];
  processing_status: ProcessingStatus;
  status?: string;
  error_message?: string | null;
  error?: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  metadata?: DocumentMetadata;
  page_count?: number;
  section_count?: number;
  total_sections?: number;
  sections_count?: number;
  semantic_unit_count?: number;
  total_semantic_units?: number;
  semantic_units_count?: number;
  active_job_id?: string | null;
  is_valid?: boolean;
}

export interface CanonicalDocument {
  document: DocumentRecord;
  sections: Section[];
  semantic_units: SemanticUnit[];
  validation_summary: ValidationSummary;
  structure_loading?: boolean;
  structure_error?: string | null;
}

export interface DashboardStats {
  total: number;
  completed: number;
  duplicate: number;
  failed: number;
  processing: number;
  totalSections: number;
  totalClinicalMarkers: number;
  specialties: Record<string, number>;
  docTypes: Record<string, number>;
}
