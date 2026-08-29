import React, { useState } from 'react';
import { FlaskConical, X, Play, Loader2, CheckCircle2, AlertTriangle, Terminal } from 'lucide-react';
import { runTests } from '../lib/api';

interface TestsRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestsRunnerModal: React.FC<TestsRunnerModalProps> = ({ isOpen, onClose }) => {
  const [running, setRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [passed, setPassed] = useState<boolean | null>(null);

  if (!isOpen) return null;

  const handleRunTests = async () => {
    setRunning(true);
    setTestOutput('Executing full test suite via pytest (14 test cases)...\n');
    setPassed(null);

    try {
      const result = await runTests();
      setTestOutput(result.output || 'Test execution completed.');
      setPassed(result.success);
    } catch (err: any) {
      setTestOutput(err.message || 'Failed to trigger test suite');
      setPassed(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Pytest Automated Verification</h3>
              <p className="text-xs text-slate-500">
                14 Unit Tests covering Hash Deduplication, 2-Tier Classifier, Section Tree 5→5.1→5.1.1, Provenance & Acyclic Validation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status banner */}
        {passed !== null && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              passed
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-300'
            }`}
          >
            {passed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              {passed
                ? 'All 14 Automated Test Suites Passed Successfully (100% Green)'
                : 'Some tests reported failures. Check terminal output below.'}
            </span>
          </div>
        )}

        {/* Terminal Log */}
        <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
            Pytest Output Stream
          </div>
          <pre className="flex-1 min-h-[260px] bg-slate-950 text-slate-100 p-3 rounded-xl overflow-y-auto font-mono text-[11px] leading-relaxed border border-slate-800 select-text">
            {testOutput || 'Click "Run Test Suite" to execute tests.'}
          </pre>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={handleRunTests}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Running Pytest...' : 'Run Test Suite'}
          </button>
        </div>
      </div>
    </div>
  );
};
