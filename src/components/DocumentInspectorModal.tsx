import React, { useState } from 'react';
import {
  X,
  FileText,
  Layers,
  Activity,
  ShieldCheck,
  Code2,
  Table as TableIcon,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Tag,
  Building,
  Calendar,
  Sparkles,
  RefreshCw,
  Trash2,
  RotateCw,
  Edit3,
  Globe2,
  Stethoscope,
} from 'lucide-react';
import { CanonicalDocument, DocumentItem } from '../types';
import { SectionTreeViewer } from './SectionTreeViewer';
import { SemanticUnitViewer } from './SemanticUnitViewer';
import { EditMetadataModal } from './EditMetadataModal';
import { CANONICAL_SPECIALTIES } from '../lib/knowledgeApi';

interface DocumentInspectorModalProps {
  document: CanonicalDocument | null;
  loading: boolean;
  onClose: () => void;
  onRetry?: (docId: string) => void;
  onReprocess?: (docId: string) => void;
  onDelete?: (docId: string) => void;
  onMetadataUpdated?: (updatedDoc: DocumentItem) => void;
}

export const DocumentInspectorModal: React.FC<DocumentInspectorModalProps> = ({
  document: canonicalDoc,
  loading,
  onClose,
  onRetry,
  onReprocess,
  onDelete,
  onMetadataUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tree' | 'units' | 'validation' | 'json'>('overview');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [localDocOverride, setLocalDocOverride] = useState<DocumentItem | null>(null);

  if (!canonicalDoc) return null;

  const doc = localDocOverride || canonicalDoc.document;
  const docId = doc.document_id || (doc as any).id || '';
  const sections = canonicalDoc.sections || [];
  const semanticUnits = canonicalDoc.semantic_units || [];
  const validation = canonicalDoc.validation_summary || { is_valid: true, status: 'PASS', errors: [], warnings: [] };
  const metadata = (doc as any).metadata;

  const clinicalMarkerCount = semanticUnits.filter((u) => u.classification === 'clinical_marker').length;
  const tableCount = semanticUnits.filter((u) => u.unit_type === 'table').length;
  const figureCount = semanticUnits.filter((u) => u.unit_type === 'figure').length;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(canonicalDoc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerReprocess = async () => {
    if (!docId) return;
    setIsReprocessing(true);
    try {
      if (onReprocess) {
        await onReprocess(docId);
      } else if (onRetry) {
        await onRetry(docId);
      }
    } finally {
      setTimeout(() => setIsReprocessing(false), 1200);
    }
  };

  const handleTriggerDelete = async () => {
    if (!onDelete || !docId) return;
    setIsDeleting(true);
    try {
      await onDelete(docId);
      onClose();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleMetadataSaved = (updated: DocumentItem) => {
    setLocalDocOverride(updated);
    if (onMetadataUpdated) {
      onMetadataUpdated(updated);
    }
  };

  // Resolve specialty list and names
  const specialtiesList: string[] = Array.isArray(doc.specialties) && doc.specialties.length > 0
    ? doc.specialties
    : doc.specialty
    ? [doc.specialty]
    : [];

  const getSpecialtyLabel = (code: string) => {
    const found = CANONICAL_SPECIALTIES.find((s) => s.code.toLowerCase() === code.toLowerCase());
    return found ? found.name : code;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold truncate text-slate-100">{doc.title || doc.file_name}</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-950 text-sky-300 border border-sky-800">
                  {doc.document_id}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase ${
                    doc.processing_status === 'completed'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : doc.processing_status === 'failed'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {doc.processing_status === 'completed'
                    ? 'Hoàn thành (Completed)'
                    : doc.processing_status === 'processing'
                    ? 'Đang phân tích (Processing)'
                    : doc.processing_status === 'failed'
                    ? 'Lỗi xử lý (Failed)'
                    : 'Đang chờ xử lý (Queued)'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {doc.file_name} {doc.file_size ? `• ${(doc.file_size / 1024).toFixed(1)} KB` : ''} • ID: {doc.document_id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Edit Metadata Button */}
            <button
              id="header-edit-metadata-btn"
              onClick={() => setIsEditModalOpen(true)}
              title="Chỉnh sửa thông tin phân loại, chuyên khoa, nguồn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-100 bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Sửa metadata</span>
            </button>

            {/* Re-analyze button */}
            <button
              onClick={handleTriggerReprocess}
              disabled={isReprocessing}
              title="Xử lý lại tài liệu qua pipeline"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin text-sky-400' : ''}`} />
              <span className="hidden sm:inline">Xử lý lại tài liệu</span>
            </button>

            {/* Delete button */}
            {onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Xóa tài liệu khỏi Database"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 flex items-center justify-between overflow-x-auto gap-2">
          <div className="flex items-center gap-1 py-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              Overview & Classification
            </button>

            <button
              onClick={() => setActiveTab('tree')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'tree'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {loading || canonicalDoc.structure_loading
                ? 'Section Hierarchy (Loading...)'
                : canonicalDoc.structure_error
                ? 'Section Hierarchy'
                : `Section Hierarchy (${sections.length})`}
            </button>

            <button
              onClick={() => setActiveTab('units')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'units'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {loading || canonicalDoc.structure_loading
                ? 'Semantic Units (Loading...)'
                : `Semantic Units (${semanticUnits.length})`}
              {clinicalMarkerCount > 0 && (
                <span className="px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">
                  {clinicalMarkerCount} markers
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('validation')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'validation'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Validation Report
              {validation.is_valid ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('json')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'json'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Canonical JSON
            </button>
          </div>

          {activeTab === 'json' && (
            <button
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 bg-slate-50/50">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Processing Status Banner */}
              {doc.processing_status === 'completed' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-2.5 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-bold">Document processed successfully.</p>
                    <p className="text-[11px] text-emerald-700">Tài liệu đã được phân tích thành công trên Medical Knowledge Engine.</p>
                  </div>
                </div>
              )}

              {doc.processing_status === 'failed' && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                      <div>
                        <p className="font-bold">Document processing failed</p>
                        <p className="text-[11px] text-rose-700">{doc.error_message || 'An unknown error occurred during parsing.'}</p>
                      </div>
                    </div>
                    {onRetry && (
                      <button
                        onClick={() => docId && onRetry(docId)}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Xử lý lại tài liệu
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(doc.processing_status === 'queued' || doc.processing_status === 'processing') && (
                <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl text-sky-900 flex items-center gap-2.5 text-xs">
                  <RefreshCw className="w-5 h-5 text-sky-600 animate-spin shrink-0" />
                  <div>
                    <p className="font-bold">
                      {doc.processing_status === 'processing' ? 'Document is currently being analyzed...' : 'Document is queued for processing...'}
                    </p>
                    <p className="text-[11px] text-sky-700">
                      {doc.processing_status === 'processing' ? 'Đang phân tích cấu trúc tài liệu y khoa...' : 'Đang chờ máy chủ xử lý...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Quick Stat Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-medium text-slate-500">Document Type</span>
                  <p className="text-sm font-bold text-sky-900 uppercase font-mono mt-0.5">
                    {doc.document_type || 'unknown'}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-medium text-slate-500">Specialty</span>
                  <p className="text-sm font-bold text-indigo-900 mt-0.5 truncate">
                    {specialtiesList.length > 0
                      ? specialtiesList.map(getSpecialtyLabel).join(', ')
                      : 'General / Chưa phân loại'}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-medium text-slate-500">Created At</span>
                  <p className="text-xs font-semibold text-slate-900 font-mono mt-0.5">
                    {doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-medium text-slate-500">Updated At</span>
                  <p className="text-xs font-semibold text-slate-900 font-mono mt-0.5">
                    {doc.updated_at ? new Date(doc.updated_at).toLocaleString() : '—'}
                  </p>
                </div>
              </div>

              {/* Classification & Metadata Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Classification & Source Metadata
                    </h3>
                    {doc.classification_source === 'manual_metadata' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Đã xác thực thủ công
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        Parser Ingest
                      </span>
                    )}
                  </div>

                  <button
                    id="card-edit-metadata-btn"
                    onClick={() => setIsEditModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Chỉnh sửa metadata</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {/* Column 1: Type, Source, Year */}
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Loại tài liệu (Document Type):</span>
                      <p className="font-semibold text-sky-900 font-mono mt-0.5">
                        {doc.document_type || 'unknown'}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Nguồn tài liệu (Source Authority):</span>
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                        <Building className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        {doc.source_authority
                          ? (doc.source_authority.toLowerCase() === 'byt'
                              ? 'Bộ Y tế Việt Nam (BYT)'
                              : doc.source_authority.toLowerCase() === 'esc'
                              ? 'ESC (European Society of Cardiology)'
                              : doc.source_authority.toLowerCase() === 'other'
                              ? 'Nguồn khác (Other)'
                              : doc.source_authority)
                          : 'Chưa gắn nguồn (None)'}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Đơn vị ban hành (Organization):</span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {doc.organization || doc.issuing_organization || 'Chưa xác định'}
                      </p>
                    </div>
                  </div>

                  {/* Column 2: Language, Year, Specialties */}
                  <div className="space-y-2.5">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Năm ban hành (Publication Year):</span>
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        {doc.publication_year ? doc.publication_year : 'Chưa rõ'}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Ngôn ngữ (Language):</span>
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                        <Globe2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        {doc.language === 'vi'
                          ? 'Tiếng Việt (vi)'
                          : doc.language === 'en'
                          ? 'English (en)'
                          : doc.language
                          ? doc.language
                          : 'Chưa xác định'}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Chuyên khoa Y tế (Specialties):</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {specialtiesList.length > 0 ? (
                          specialtiesList.map((code, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-medium"
                            >
                              {getSpecialtyLabel(code)}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Chưa gắn chuyên khoa</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Classification details & structure stats */}
                  <div className="space-y-2.5 md:col-span-2 lg:col-span-1">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Classification Mode:</span>
                      <p className="font-mono text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-200 text-[11px] mt-0.5">
                        {doc.classification_source === 'manual_metadata'
                          ? 'manual_metadata (Admin configured)'
                          : doc.classification_source || 'parser_only'}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Sections & Semantic Units:</span>
                      <p className="text-slate-700 mt-0.5">
                        <strong className="font-mono">{doc.sections_count ?? doc.total_sections ?? sections.length}</strong> sections • <strong className="font-mono">{doc.semantic_units_count ?? doc.total_semantic_units ?? semanticUnits.length}</strong> semantic units
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Topics / Từ khóa:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {doc.topics && doc.topics.length > 0 ? (
                          doc.topics.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Identity & Cryptographic Hash */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2.5 text-xs">
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Document Identity & Storage
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">SHA-256 Content Fingerprint:</span>
                    <p className="font-mono text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-200 select-all break-all mt-0.5 text-[11px]">
                      {doc.file_hash}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-400">Canonical Storage Artifacts:</span>
                    <p className="font-mono text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-200 truncate mt-0.5 text-[11px]">
                      /output/{doc.document_id}/
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SECTION HIERARCHY TREE */}
          {activeTab === 'tree' && (
            <div>
              {loading || canonicalDoc.structure_loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">Đang tải cấu trúc section tree...</p>
                </div>
              ) : sections.length > 0 ? (
                <SectionTreeViewer sections={sections} onSelectSection={setSelectedSectionId} />
              ) : (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">
                    {canonicalDoc.structure_error || 'Chưa có cấu trúc section nào được trích xuất.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SEMANTIC UNITS */}
          {activeTab === 'units' && (
            <div>
              {loading || canonicalDoc.structure_loading ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <RefreshCw className="w-8 h-8 text-sky-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">Đang tải danh sách semantic units...</p>
                </div>
              ) : semanticUnits.length > 0 ? (
                <SemanticUnitViewer
                  units={semanticUnits}
                  activeSectionId={selectedSectionId}
                  onClearSectionFilter={() => setSelectedSectionId(null)}
                />
              ) : (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <Activity className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">
                    {canonicalDoc.structure_error || 'Chưa có semantic units nào được tạo.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VALIDATION */}
          {activeTab === 'validation' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                  validation.is_valid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {validation.is_valid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <h3 className="font-bold">
                      {validation.is_valid ? 'Validation Passed' : 'Validation Issues Detected'}
                    </h3>
                    <p className="text-[11px] opacity-80">
                      Trạng thái kiểm định tính toàn vẹn: {validation.status}
                    </p>
                  </div>
                </div>
              </div>

              {validation.errors && validation.errors.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-rose-200 space-y-2 text-xs">
                  <h4 className="font-bold text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Errors ({validation.errors.length})
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-rose-600 text-[11px]">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.warnings && validation.warnings.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-amber-200 space-y-2 text-xs">
                  <h4 className="font-bold text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Warnings ({validation.warnings.length})
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-amber-600 text-[11px]">
                    {validation.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CANONICAL JSON */}
          {activeTab === 'json' && (
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-[11px] overflow-x-auto">
              <pre>{JSON.stringify(canonicalDoc, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-60 bg-slate-950/70 flex items-center justify-center p-4 backdrop-blur-2xs">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">Xác nhận xóa tài liệu</h3>
              </div>
              <p className="text-xs text-slate-600">
                Bạn có chắc chắn muốn xóa tài liệu <strong>{doc.file_name}</strong> ({doc.document_id})? Hành động này sẽ xóa toàn bộ bản ghi và artifacts liên quan.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleTriggerDelete}
                  disabled={isDeleting}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Metadata Modal */}
        <EditMetadataModal
          document={doc}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={handleMetadataSaved}
        />
      </div>
    </div>
  );
};
