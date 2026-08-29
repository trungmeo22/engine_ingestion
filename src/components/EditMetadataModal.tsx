import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Check,
  AlertCircle,
  Building2,
  Calendar,
  Globe2,
  FileText,
  Stethoscope,
  ShieldCheck,
  Loader2,
  Info,
} from 'lucide-react';
import { DocumentItem, DocumentRecord, DocumentMetadataPatch, SpecialtyItem } from '../types';
import { updateDocumentMetadata, CANONICAL_SPECIALTIES } from '../lib/knowledgeApi';

interface EditMetadataModalProps {
  document: DocumentItem | DocumentRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedDoc: DocumentItem) => void;
}

const DOCUMENT_TYPES = [
  { value: 'guideline', label: 'Hướng dẫn điều trị (Guideline)' },
  { value: 'consensus', label: 'Đồng thuận chuyên gia (Consensus)' },
  { value: 'position_statement', label: 'Tuyên bố lập trường (Position Statement)' },
  { value: 'protocol', label: 'Phác đồ điều trị (Protocol)' },
  { value: 'rct', label: 'Thử nghiệm lâm sàng (RCT)' },
  { value: 'systematic_review', label: 'Tổng quan hệ thống (Systematic Review)' },
  { value: 'meta_analysis', label: 'Phân tích tổng hợp (Meta-analysis)' },
  { value: 'observational_study', label: 'Nghiên cứu quan sát (Observational Study)' },
  { value: 'textbook', label: 'Giáo trình / Sách y khoa (Textbook)' },
  { value: 'review', label: 'Bài tổng quan y học (Review)' },
  { value: 'other', label: 'Loại tài liệu khác' },
  { value: 'unknown', label: 'Chưa xác định' },
];

const SOURCE_AUTHORITY_OPTIONS = [
  { value: 'byt', label: 'Bộ Y tế Việt Nam (BYT)', defaultOrg: 'Bộ Y tế Việt Nam' },
  { value: 'esc', label: 'European Society of Cardiology (ESC)', defaultOrg: 'European Society of Cardiology' },
  { value: 'other', label: 'Nguồn khác (Other)', defaultOrg: '' },
  { value: '', label: 'Chưa gắn nguồn (None)', defaultOrg: '' },
];

const LANGUAGE_OPTIONS = [
  { value: 'vi', label: 'Tiếng Việt (vi)' },
  { value: 'en', label: 'English (en)' },
  { value: 'other', label: 'Ngôn ngữ khác' },
];

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({
  document,
  isOpen,
  onClose,
  onSuccess,
}) => {
  // Form states initialized safely regardless of document or isOpen
  const [sourceAuthority, setSourceAuthority] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('guideline');
  const [organization, setOrganization] = useState<string>('');
  const [publicationYear, setPublicationYear] = useState<string>('');
  const [language, setLanguage] = useState<string>('vi');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state whenever document or isOpen changes
  useEffect(() => {
    if (document) {
      setSourceAuthority(document.source_authority || '');
      setDocumentType(document.document_type || 'guideline');
      setOrganization(document.organization || (document as any).issuing_organization || '');
      setPublicationYear(document.publication_year ? String(document.publication_year) : '');
      setLanguage(document.language || 'vi');
      
      if (Array.isArray(document.specialties) && document.specialties.length > 0) {
        setSelectedSpecialties(document.specialties);
      } else if (document.specialty) {
        setSelectedSpecialties([document.specialty]);
      } else {
        setSelectedSpecialties([]);
      }
      setErrorMessage(null);
    }
  }, [document, isOpen]);

  if (!isOpen || !document) return null;

  const handleSourceAuthorityChange = (val: string) => {
    setSourceAuthority(val);
    // Autofill organization if currently empty
    const matched = SOURCE_AUTHORITY_OPTIONS.find((o) => o.value === val);
    if (matched?.defaultOrg && !organization) {
      setOrganization(matched.defaultOrg);
    }
  };

  const toggleSpecialty = (code: string) => {
    setSelectedSpecialties((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate publication_year
    let parsedYear: number | null = null;
    if (publicationYear.trim()) {
      const yr = parseInt(publicationYear.trim(), 10);
      if (isNaN(yr) || yr < 1900 || yr > 2100) {
        setErrorMessage('Năm xuất bản phải là số nguyên trong khoảng 1900 đến 2100.');
        return;
      }
      parsedYear = yr;
    }

    const patch: DocumentMetadataPatch = {
      source_authority: sourceAuthority ? sourceAuthority : null,
      document_type: documentType,
      organization: organization.trim() ? organization.trim() : null,
      publication_year: parsedYear,
      language: language ? language.toLowerCase() : null,
      specialties: selectedSpecialties,
      specialty: selectedSpecialties.length > 0 ? selectedSpecialties[0] : null,
    };

    setIsSaving(true);
    try {
      const updatedDoc = await updateDocumentMetadata(document.document_id, patch);
      onSuccess(updatedDoc);
      onClose();
    } catch (err: any) {
      console.error('Failed to update metadata:', err);
      setErrorMessage(err.message || 'Không thể lưu metadata. Vui lòng kiểm tra lại kết nối.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="edit-metadata-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        id="edit-metadata-modal-container"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Chỉnh sửa Metadata tài liệu</h2>
              <p className="text-xs text-slate-300 truncate max-w-md font-mono mt-0.5">
                {document.file_name} <span className="text-slate-400">({document.document_id})</span>
              </p>
            </div>
          </div>
          <button
            id="close-edit-metadata-modal-btn"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Info Banner */}
        <div className="px-6 py-2.5 bg-sky-50/80 border-b border-sky-100 flex items-start gap-2.5 text-xs text-sky-800">
          <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <span>
            <strong>Chỉnh sửa thủ công:</strong> Cập nhật thông tin phân loại trực tiếp mà không cần chạy lại parser hoặc gọi mô hình LLM.
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 1. Nguồn tài liệu & Đơn vị ban hành */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                Nguồn tài liệu (Source Authority)
              </label>
              <select
                id="edit-source-authority-select"
                value={sourceAuthority}
                onChange={(e) => handleSourceAuthorityChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-hidden transition-all text-xs"
              >
                {SOURCE_AUTHORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-sky-600" />
                Đơn vị ban hành (Organization)
              </label>
              <input
                id="edit-organization-input"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="VD: Bộ Y tế Việt Nam, Hội Tim Mạch..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-hidden transition-all text-xs"
              />
            </div>
          </div>

          {/* 2. Loại tài liệu & Năm ban hành & Ngôn ngữ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-600" />
                Loại tài liệu (Document Type)
              </label>
              <select
                id="edit-document-type-select"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-hidden transition-all text-xs"
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                Năm ban hành (Year)
              </label>
              <input
                id="edit-publication-year-input"
                type="number"
                min="1900"
                max="2100"
                value={publicationYear}
                onChange={(e) => setPublicationYear(e.target.value)}
                placeholder="VD: 2023"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-hidden transition-all text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 text-sky-600" />
                Ngôn ngữ (Language)
              </label>
              <select
                id="edit-language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-hidden transition-all text-xs"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Chuyên khoa Y tế (Specialties Multi-Select Grid) */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
                Chuyên khoa Y tế ({selectedSpecialties.length} đã chọn)
              </label>
              {selectedSpecialties.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSpecialties([])}
                  className="text-[11px] text-slate-500 hover:text-rose-600 underline font-medium"
                >
                  Bỏ chọn tất cả
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border border-slate-200">
              {CANONICAL_SPECIALTIES.map((spec: SpecialtyItem) => {
                const isSelected = selectedSpecialties.includes(spec.code);
                return (
                  <button
                    key={spec.code}
                    type="button"
                    id={`specialty-toggle-${spec.code}`}
                    onClick={() => toggleSpecialty(spec.code)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all border ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-600 font-semibold shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate pr-1">{spec.name}</span>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 shrink-0 text-white" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded border border-slate-300 shrink-0 bg-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Nguồn phân loại sẽ được đặt là <strong>manual_metadata</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              id="cancel-edit-metadata-btn"
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
            >
              Hủy
            </button>
            <button
              id="save-edit-metadata-btn"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Lưu metadata
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
