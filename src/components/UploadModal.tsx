import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Tag,
  BookOpen,
  Building2,
  Calendar,
  Languages,
  Layers,
} from 'lucide-react';
import {
  uploadDocument,
  pollJobUntilFinished,
  getSourceAuthorities,
} from '../lib/knowledgeApi';
import { unmarkDeletedDocId } from '../lib/api';
import { SourceAuthority } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (docId: string) => void;
}

const CANONICAL_DOCUMENT_TYPES: { code: string; label: string }[] = [
  { code: 'unknown', label: 'Chưa xác định' },
  { code: 'guideline', label: 'Hướng dẫn / Guideline' },
  { code: 'consensus', label: 'Đồng thuận chuyên gia / Consensus' },
  { code: 'position_statement', label: 'Position statement' },
  { code: 'protocol', label: 'Phác đồ / Protocol' },
  { code: 'rct', label: 'Thử nghiệm ngẫu nhiên có đối chứng (RCT)' },
  { code: 'systematic_review', label: 'Systematic review' },
  { code: 'meta_analysis', label: 'Meta-analysis' },
  { code: 'observational_study', label: 'Nghiên cứu quan sát' },
  { code: 'textbook', label: 'Sách / Textbook' },
  { code: 'review', label: 'Bài tổng quan / Review' },
  { code: 'other', label: 'Loại khác' },
];

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: '', label: 'Chưa xác định / Tự động' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'other', label: 'Khác' },
];

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Metadata form state
  const [sourceAuthority, setSourceAuthority] = useState<string>('other');
  const [authorities, setAuthorities] = useState<SourceAuthority[]>([
    { code: 'other', name: 'Nguồn khác', geographic_scope: 'Other' },
  ]);
  const [loadingAuthorities, setLoadingAuthorities] = useState<boolean>(false);
  const [authoritiesError, setAuthoritiesError] = useState<string | null>(null);

  const [documentType, setDocumentType] = useState<string>('unknown');
  const [publicationYear, setPublicationYear] = useState<string>('');
  const [language, setLanguage] = useState<string>('vi');

  const [title, setTitle] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch source authorities from backend when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchAuthorities() {
      setLoadingAuthorities(true);
      setAuthoritiesError(null);
      try {
        const list = await getSourceAuthorities();
        if (isMounted && Array.isArray(list) && list.length > 0) {
          setAuthorities(list);
          // If current selection is not in list, keep 'other' or pick first
          const hasSelected = list.some((a) => a.code === sourceAuthority);
          if (!hasSelected) {
            const defaultAuth = list.find((a) => a.code === 'byt') || list.find((a) => a.code === 'other') || list[0];
            if (defaultAuth) {
              setSourceAuthority(defaultAuth.code);
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[UploadModal] Failed to load source authorities:', err.message);
          setAuthoritiesError('Không thể tải danh sách nguồn từ máy chủ, đang sử dụng cấu hình mặc định.');
          setAuthorities([
            { code: 'other', name: 'Nguồn khác', geographic_scope: 'Other' },
          ]);
        }
      } finally {
        if (isMounted) {
          setLoadingAuthorities(false);
        }
      }
    }

    fetchAuthorities();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isPdf = ext === '.pdf' || file.type === 'application/pdf';

    if (!isPdf) {
      setError('Chỉ hỗ trợ tệp định dạng PDF cho pipeline phân tích.');
      setSelectedFile(null);
      return;
    }

    const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_SIZE_BYTES) {
      setError('Dung lượng tệp vượt quá giới hạn 100MB.');
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
    if (!title) {
      // Auto-populate title from clean filename
      const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
      setTitle(cleanName);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;

    // Validate publication year if provided
    let yearNum: number | undefined = undefined;
    if (publicationYear.trim() !== '') {
      const parsed = parseInt(publicationYear.trim(), 10);
      if (isNaN(parsed) || parsed < 1900 || parsed > 2100) {
        setError('Năm xuất bản không hợp lệ (vui lòng nhập số từ 1900 đến 2100).');
        return;
      }
      yearNum = parsed;
    }

    setUploading(true);
    setError(null);
    setStatusLog('Đang tải tệp PDF lên máy chủ qua multipart/form-data...');
    setActiveStage('upload');

    try {
      const result = await uploadDocument(selectedFile, {
        source_authority: sourceAuthority || 'other',
        document_type: documentType || 'unknown',
        publication_year: yearNum,
        language: language || undefined,
        title: title.trim() || selectedFile.name,
        tags: tags.length > 0 ? tags : undefined,
      });

      const uploadedDocId = result.document_id || result.external_id;
      if (!uploadedDocId) {
        throw new Error('Tải lên hoàn tất nhưng máy chủ không trả về Document ID hợp lệ.');
      }

      unmarkDeletedDocId(uploadedDocId);

      // If server provided a job_id, poll status to update user in real-time
      if (result.job_id) {
        setStatusLog(`Đang khởi chạy tiến trình phân tích (Job: ${result.job_id.slice(0, 8)}...).`);
        setActiveStage('parser');

        try {
          pollJobUntilFinished(
            result.job_id,
            (job) => {
              if (job.stage) {
                setActiveStage(job.stage);
                setStatusLog(`Giai đoạn: ${job.stage} (${job.status})`);
              } else {
                setStatusLog(`Đang xử lý: ${job.status}...`);
              }
            },
            2000,
            15000
          ).catch((e) => console.log('Job continues in background:', e));
        } catch {
          // Non-blocking
        }
      }

      if (result.status === 'duplicate') {
        setStatusLog('Tài liệu đã tồn tại. Đã cập nhật bản ghi phân tích.');
      } else {
        setStatusLog('Tài liệu đã được thêm vào hàng đợi phân tích thành công.');
      }

      setTimeout(() => {
        setUploading(false);
        onClose();
        onUploadSuccess(uploadedDocId);
      }, 700);
    } catch (err: any) {
      console.error('[UploadModal Error]:', err);
      setError(err.message || 'Đã xảy ra lỗi khi tải lên tài liệu.');
      setUploading(false);
      setActiveStage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shadow-xs">
              <Upload className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Tải lên tài liệu y khoa</h3>
              <p className="text-xs text-slate-500 font-medium">
                Docling Parser Ingestion • Không gọi LLM phân loại
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Drag and Drop Zone (Tệp) */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-sky-500 bg-sky-50/50'
              : selectedFile
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-300 hover:border-sky-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
          />

          {selectedFile ? (
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800 truncate max-w-md mx-auto">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-slate-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Tệp PDF sẵn sàng tải lên
              </p>
              {!uploading && (
                <span className="text-[11px] text-sky-600 hover:underline">Nhấn để chọn tệp PDF khác</span>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700">
                Kéo thả tệp PDF hướng dẫn y khoa / tài liệu vào đây
              </p>
              <p className="text-[11px] text-slate-400">
                Hỗ trợ tệp định dạng PDF tối đa 100MB
              </p>
            </div>
          )}
        </div>

        {/* Metadata Inputs Form */}
        <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          {/* 2. Nguồn tài liệu * (Source Authority) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-sky-600" />
                Nguồn tài liệu <span className="text-rose-500 font-bold">*</span>
              </label>
              {loadingAuthorities && (
                <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Đang tải danh sách nguồn...
                </span>
              )}
            </div>

            <select
              value={sourceAuthority}
              onChange={(e) => setSourceAuthority(e.target.value)}
              disabled={uploading || loadingAuthorities}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
            >
              {authorities.map((auth) => (
                <option key={auth.code} value={auth.code}>
                  {auth.name} ({auth.geographic_scope || 'Other'})
                </option>
              ))}
            </select>

            {authoritiesError && (
              <p className="text-[10px] text-amber-600 mt-1">{authoritiesError}</p>
            )}
          </div>

          {/* 3. Loại tài liệu (Document Type) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Loại tài liệu
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              disabled={uploading}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
            >
              {CANONICAL_DOCUMENT_TYPES.map((dt) => (
                <option key={dt.code} value={dt.code}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Năm xuất bản & 5. Ngôn ngữ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                Năm xuất bản <span className="text-slate-400 font-normal">(tùy chọn)</span>
              </label>
              <input
                type="number"
                min={1900}
                max={2100}
                step={1}
                placeholder="VD: 2023"
                value={publicationYear}
                onChange={(e) => setPublicationYear(e.target.value)}
                disabled={uploading}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-purple-600" />
                Ngôn ngữ
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={uploading}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tiêu đề hiển thị (Tùy chọn) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              Tiêu đề tài liệu <span className="text-slate-400 font-normal">(tùy chọn)</span>
            </label>
            <input
              type="text"
              placeholder="VD: Hướng dẫn chẩn đoán và điều trị suy tim cấp và mạn"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Thẻ phân loại (Tags - Tùy chọn) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              Thẻ chủ đề <span className="text-slate-400 font-normal">(tùy chọn)</span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="VD: Tim mạch, Suy tim..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                disabled={uploading}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={uploading}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md text-[11px] font-medium"
                  >
                    {t}
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-sky-400 hover:text-sky-700 cursor-pointer font-bold"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Lỗi tải lên</p>
              <p className="text-[11px] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Status Log / Ingest Stage */}
        {statusLog && (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1.5">
            <div className="flex items-center gap-2 font-medium">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>{statusLog}</span>
            </div>
            {activeStage && (
              <div className="flex items-center gap-1 text-[11px] text-sky-700 font-mono pl-6">
                <span>Giai đoạn: {activeStage}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFile || uploading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
          >
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {uploading ? 'Đang tải lên...' : 'Tải lên & Phân tích'}
          </button>
        </div>
      </div>
    </div>
  );
};

