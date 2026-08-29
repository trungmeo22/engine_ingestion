import React, { useState } from 'react';
import {
  FileText,
  Search,
  Eye,
  RotateCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Hash,
  Activity,
  FolderSync,
  Edit3,
  Building,
} from 'lucide-react';
import { DocumentRecord, ProcessingStatus, DocumentItem } from '../types';
import { EditMetadataModal } from './EditMetadataModal';
import { CANONICAL_SPECIALTIES } from '../lib/knowledgeApi';

interface DocumentListProps {
  documents: DocumentRecord[];
  loading: boolean;
  onInspect: (docId: string) => void;
  onRetry: (docId: string) => void;
  onReprocess?: (docId: string) => void;
  onDelete?: (docId: string) => void;
  onDeleteAllFailed?: () => Promise<void> | void;
  onGenerateSamples?: () => void;
  onMetadataUpdated?: (updatedDoc: DocumentItem) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  loading,
  onInspect,
  onRetry,
  onReprocess,
  onDelete,
  onDeleteAllFailed,
  onGenerateSamples,
  onMetadataUpdated,
}) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editDocTarget, setEditDocTarget] = useState<DocumentRecord | null>(null);

  const failedDocs = documents.filter(
    (d) => d.processing_status === 'failed' || (d as any).status === 'failed'
  );

  // Available unique types & specialties for filter
  const availableTypes = Array.from(
    new Set(documents.flatMap((d) => (d.document_type ? [String(d.document_type)] : [])))
  );
  const availableSpecialties = Array.from(
    new Set(
      documents.flatMap((d) => {
        if (Array.isArray(d.specialties) && d.specialties.length > 0) {
          return d.specialties;
        }
        return d.specialty ? [String(d.specialty)] : [];
      })
    )
  );

  // Helper for specialty label
  const getSpecialtyLabel = (code: string) => {
    const found = CANONICAL_SPECIALTIES.find((s) => s.code.toLowerCase() === code.toLowerCase());
    return found ? found.name : code;
  };

  // Filtering
  const filteredDocs = documents.filter((doc) => {
    const docSpecialties = Array.isArray(doc.specialties) && doc.specialties.length > 0
      ? doc.specialties
      : doc.specialty
      ? [doc.specialty]
      : [];

    const matchesSearch =
      search === '' ||
      (doc.title && doc.title.toLowerCase().includes(search.toLowerCase())) ||
      (doc.file_name && doc.file_name.toLowerCase().includes(search.toLowerCase())) ||
      (doc.organization && doc.organization.toLowerCase().includes(search.toLowerCase())) ||
      (doc.source_authority && doc.source_authority.toLowerCase().includes(search.toLowerCase())) ||
      docSpecialties.some((s) => s.toLowerCase().includes(search.toLowerCase()) || getSpecialtyLabel(s).toLowerCase().includes(search.toLowerCase())) ||
      (doc.topics && doc.topics.some((t) => t.toLowerCase().includes(search.toLowerCase()))) ||
      (doc.file_hash && doc.file_hash.toLowerCase().includes(search.toLowerCase())) ||
      (doc.document_id && doc.document_id.toLowerCase().includes(search.toLowerCase()));

    const matchesType = selectedType === 'all' || doc.document_type === selectedType;
    const matchesSpecialty =
      selectedSpecialty === 'all' || docSpecialties.includes(selectedSpecialty);

    let matchesStatus = true;
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'completed') {
        matchesStatus = doc.processing_status === 'completed';
      } else if (selectedStatus === 'processing') {
        matchesStatus = ['processing', 'queued', 'classifying', 'parsing', 'validating', 'retrying', 'uploaded'].includes(
          doc.processing_status
        );
      } else if (selectedStatus === 'failed') {
        matchesStatus = doc.processing_status === 'failed';
      } else if (selectedStatus === 'duplicate') {
        matchesStatus = doc.processing_status === 'duplicate';
      }
    }

    return matchesSearch && matchesType && matchesSpecialty && matchesStatus;
  });

  const handleTriggerReprocess = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReprocessingId(docId);
    try {
      if (onReprocess) {
        await onReprocess(docId);
      } else {
        await onRetry(docId);
      }
    } finally {
      setTimeout(() => setReprocessingId(null), 1000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.document_id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (!onDeleteAllFailed) return;
    setIsBulkDeleting(true);
    try {
      await onDeleteAllFailed();
      setShowBulkDeleteModal(false);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getStatusBadge = (status: ProcessingStatus | string, error?: string | null, activeJobId?: string | null) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Completed
          </span>
        );
      case 'processing':
      case 'classifying':
      case 'parsing':
      case 'validating':
      case 'retrying':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
            <span>Processing...</span>
          </span>
        );
      case 'queued':
      case 'uploaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            {status === 'uploaded' ? 'Uploaded' : 'Queued'}
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Failed
          </span>
        );
      case 'duplicate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold">
            <Hash className="w-3.5 h-3.5 text-slate-500" />
            Duplicate
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium capitalize">
            {status}
          </span>
        );
    }
  };

  const getDocTypeBadge = (type?: string) => {
    const t = (type || 'unknown').toLowerCase();
    switch (t) {
      case 'guideline':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">Hướng dẫn / Guideline</span>;
      case 'consensus':
        return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">Đồng thuận / Consensus</span>;
      case 'position_statement':
        return <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-bold">Position statement</span>;
      case 'protocol':
        return <span className="px-2 py-0.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded text-[10px] font-bold">Phác đồ / Protocol</span>;
      case 'rct':
      case 'clinical_trial':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">Thử nghiệm RCT</span>;
      case 'systematic_review':
        return <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold">Systematic review</span>;
      case 'meta_analysis':
        return <span className="px-2 py-0.5 bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 rounded text-[10px] font-bold">Meta-analysis</span>;
      case 'observational_study':
        return <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded text-[10px] font-bold">Nghiên cứu quan sát</span>;
      case 'textbook':
        return <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold">Sách / Textbook</span>;
      case 'review':
        return <span className="px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[10px] font-bold">Bài tổng quan / Review</span>;
      case 'other':
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-medium">Loại khác</span>;
      case 'unknown':
      default:
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-medium">Chưa xác định</span>;
    }
  };

  const formatSourceAuthority = (codeOrOrg?: string | null, sourceAuth?: string | null) => {
    const raw = (sourceAuth || codeOrOrg || '').toLowerCase();
    if (raw === 'byt' || raw.includes('bộ y tế') || raw.includes('vietnam_moh')) return 'Bộ Y tế Việt Nam';
    if (raw === 'esc') return 'ESC';
    if (raw === 'other') return 'Nguồn khác';
    if (sourceAuth) return sourceAuth;
    return codeOrOrg || 'Chưa gắn nguồn';
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Strip */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by guideline title, filename, hash, organization (ESC, KDIGO), topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All Statuses ({documents.length})</option>
            <option value="completed">Completed ({documents.filter((d) => d.processing_status === 'completed').length})</option>
            <option value="processing">Processing / Ingesting</option>
            <option value="failed">Failed ({failedDocs.length})</option>
            <option value="duplicate">Duplicates</option>
          </select>

          {/* Doc Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All Types</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Specialty Filter */}
          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">All Specialties</option>
            {availableSpecialties.map((s) => (
              <option key={s} value={s}>
                {getSpecialtyLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Failed Documents Bulk Cleanup Banner */}
      {failedDocs.length > 0 && onDeleteAllFailed && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-rose-900">
                Phát hiện {failedDocs.length} tài liệu bị lỗi (failed)
              </span>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Các file rác / dung lượng nhỏ upload hỏng có thể được xóa triệt để (Hard Delete) khỏi database, jobs và storage.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowBulkDeleteModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa sạch tất cả {failedDocs.length} file lỗi</span>
          </button>
        </div>
      )}

      {/* Documents Table */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 mx-auto flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">No Documents in Inventory</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Upload your medical guideline PDF or trigger batch ingestion to populate the repository.
            </p>
          </div>
          {onGenerateSamples && (
            <button
              onClick={onGenerateSamples}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Upload Medical Guideline PDF
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="px-4 py-3 text-left">Document / Title</th>
                  <th className="px-3 py-3 text-left">Classification</th>
                  <th className="px-3 py-3 text-left">Specialty & Org</th>
                  <th className="px-3 py-3 text-center">Sections</th>
                  <th className="px-3 py-3 text-center">Units</th>
                  <th className="px-3 py-3 text-left">Parser Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDocs.map((doc) => {
                  const isProcessing = ['processing', 'queued', 'classifying', 'parsing', 'validating', 'retrying'].includes(
                    doc.processing_status
                  );
                  const isFailed = doc.processing_status === 'failed';
                  const sectionCount = doc.total_sections ?? doc.sections_count ?? doc.section_count;
                  const unitCount = doc.total_semantic_units ?? doc.semantic_units_count ?? doc.semantic_unit_count;

                  const docSpecialties = Array.isArray(doc.specialties) && doc.specialties.length > 0
                    ? doc.specialties
                    : doc.specialty
                    ? [doc.specialty]
                    : [];

                  return (
                    <tr
                      key={doc.document_id}
                      onClick={() => onInspect(doc.document_id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Title & File Info */}
                      <td className="px-4 py-3 max-w-sm">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 group-hover:text-sky-700 truncate text-xs">
                              {doc.title || doc.file_name}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {doc.file_name} • {(doc.file_size / 1024).toFixed(1)} KB
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400 select-all">
                                ID: {doc.document_id}
                              </span>
                              {doc.classification_source === 'manual_metadata' && (
                                <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-semibold">
                                  Thủ công
                                </span>
                              )}
                              {doc.created_at && (
                                <span className="text-[10px] text-slate-400">
                                  • {new Date(doc.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Document Type Badge */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {getDocTypeBadge(doc.document_type)}
                      </td>

                      {/* Specialty & Organization / Source Authority */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">
                              {formatSourceAuthority(doc.organization, doc.source_authority)}
                            </span>
                            {doc.source_authority && (
                              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-mono uppercase">
                                {doc.source_authority}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {docSpecialties.length > 0 ? (
                              <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-medium">
                                {getSpecialtyLabel(docSpecialties[0])}
                                {docSpecialties.length > 1 ? ` +${docSpecialties.length - 1}` : ''}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Chưa gắn chuyên khoa</span>
                            )}

                            {doc.publication_year && (
                              <span className="text-[10px] text-slate-400">
                                ({doc.publication_year})
                              </span>
                            )}

                            {doc.language && (
                              <span className="px-1 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-bold uppercase">
                                {doc.language}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Total Sections */}
                      <td className="px-3 py-3 text-center whitespace-nowrap font-mono font-semibold text-slate-700">
                        {isProcessing ? (
                          <span className="text-slate-400 text-[11px]">parsing...</span>
                        ) : sectionCount !== undefined && sectionCount !== null ? (
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <Layers className="w-3 h-3 text-indigo-500 inline" />
                            {sectionCount}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Total Semantic Units */}
                      <td className="px-3 py-3 text-center whitespace-nowrap font-mono font-semibold text-slate-700">
                        {isProcessing ? (
                          <span className="text-slate-400 text-[11px]">extracting...</span>
                        ) : unitCount !== undefined && unitCount !== null ? (
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <FileSpreadsheet className="w-3 h-3 text-sky-500 inline" />
                            {unitCount}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {getStatusBadge(doc.processing_status, doc.error_message, doc.active_job_id)}
                        {doc.error_message && (
                          <p className="text-[10px] text-rose-600 truncate max-w-xs mt-0.5" title={doc.error_message}>
                            {doc.error_message}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Sửa metadata button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditDocTarget(doc);
                            }}
                            title="Chỉnh sửa thông tin metadata thủ công (Specialty, Org, Source)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">Sửa metadata</span>
                          </button>

                          {/* Re-process / Re-ingest Button */}
                          <button
                            onClick={(e) => handleTriggerReprocess(doc.document_id, e)}
                            title="Xử lý lại tài liệu qua pipeline parser (Docling & Section Tree)"
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${reprocessingId === doc.document_id ? 'animate-spin text-sky-600' : ''}`} />
                            <span className="hidden sm:inline">Xử lý lại</span>
                          </button>

                          {/* Inspect Button */}
                          <button
                            onClick={() => onInspect(doc.document_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Chi tiết</span>
                          </button>

                          {/* Delete Document Button */}
                          {onDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(doc);
                              }}
                              title="Xóa tài liệu khỏi database"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editDocTarget && (
        <EditMetadataModal
          document={editDocTarget}
          isOpen={Boolean(editDocTarget)}
          onClose={() => setEditDocTarget(null)}
          onSuccess={(updated) => {
            if (onMetadataUpdated) {
              onMetadataUpdated(updated);
            }
            setEditDocTarget(null);
          }}
        />
      )}

      {/* Single Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {deleteTarget.processing_status === 'failed' || (deleteTarget as any).status === 'failed'
                      ? 'Xác nhận Hard Delete tài liệu lỗi'
                      : 'Xác nhận xóa tài liệu'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {deleteTarget.processing_status === 'failed' || (deleteTarget as any).status === 'failed'
                      ? 'Tài liệu này sẽ bị xóa vĩnh viễn (Hard Delete): gỡ bỏ bản ghi DB, xóa job xử lý và dọn dẹp toàn bộ file rác trong Storage.'
                      : 'Bạn có chắc chắn muốn xóa tài liệu này không? Bản ghi sẽ bị gỡ bỏ khỏi hệ thống.'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="font-semibold text-slate-800 truncate">{deleteTarget.title || deleteTarget.file_name}</p>
                <p className="font-mono text-[11px] text-slate-500 truncate">ID: {deleteTarget.document_id}</p>
                {deleteTarget.file_size !== undefined && (
                  <p className="text-[11px] font-mono text-slate-500">
                    Size: {deleteTarget.file_size < 1024 ? `${deleteTarget.file_size} B` : `${(deleteTarget.file_size / 1024).toFixed(1)} KB`}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete All Failed Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Xóa sạch tất cả {failedDocs.length} tài liệu lỗi (Bulk Hard Delete)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Hệ thống sẽ thực hiện dọn dẹp hàng loạt toàn bộ {failedDocs.length} tài liệu đang ở trạng thái <code>failed</code>. Toàn bộ bản ghi DB, hàng đợi jobs và file rác trên storage sẽ bị xóa sạch hoàn toàn.
                  </p>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                {failedDocs.map((d) => (
                  <div key={d.document_id} className="p-2.5 flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{d.title || d.file_name}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">{d.document_id}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={handleConfirmBulkDelete}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isBulkDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {isBulkDeleting ? 'Đang dọn dẹp...' : `Xác nhận xóa hết (${failedDocs.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

