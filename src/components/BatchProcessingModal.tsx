import React, { useState } from 'react';
import { FolderInput, X, Play, Loader2, CheckCircle2, AlertTriangle, Terminal } from 'lucide-react';
import { batchIngest } from '../lib/api';

interface BatchProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BatchProcessingModal: React.FC<BatchProcessingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunBatch = async () => {
    setRunning(true);
    setError(null);
    setOutput('Initiating fault-isolated batch ingestion across ./input directory...\n');

    try {
      const result = await batchIngest();
      if (!result.success) {
        throw new Error(result.error || 'Batch ingestion encountered an error');
      }
      setOutput(result.output || 'Batch ingestion completed.');
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <FolderInput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Batch Ingestion Engine</h3>
              <p className="text-xs text-slate-500">
                Discovers and ingests all documents in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">./input</code>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-800">Batch Processing Guarantees:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
            <li><strong>Fault Isolation</strong>: An error in one corrupted file never halts remaining documents.</li>
            <li><strong>Deduplication</strong>: Files with matching SHA-256 hashes are flagged as duplicate without reprocessing.</li>
            <li><strong>Deterministic Hierarchy</strong>: Reconstructs full 5 → 5.1 → 5.1.1 structure for all files.</li>
          </ul>
        </div>

        {/* Terminal output */}
        {output && (
          <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              Pipeline Execution Log
            </div>
            <pre className="flex-1 min-h-[160px] bg-slate-950 text-slate-100 p-3 rounded-xl overflow-y-auto font-mono text-[11px] leading-relaxed border border-slate-800 select-text">
              {output}
            </pre>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={handleRunBatch}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Ingesting Batch...' : 'Start Batch Processing'}
          </button>
        </div>
      </div>
    </div>
  );
};
