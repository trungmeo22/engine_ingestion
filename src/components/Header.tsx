import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Layers,
  Upload,
  FolderInput,
  Sparkles,
  FlaskConical,
  RefreshCw,
  Stethoscope,
  Database,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface HeaderProps {
  stats: DashboardStats | null;
  loading: boolean;
  serverOnline?: boolean | null;
  supabaseOnline?: boolean | null;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onOpenBatch: () => void;
  onGenerateSamples: () => void;
  onOpenTests: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  loading,
  serverOnline = true,
  supabaseOnline = true,
  onRefresh,
  onOpenUpload,
  onOpenBatch,
  onGenerateSamples,
  onOpenTests,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Brand & Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-sm ring-2 ring-sky-100">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Medical Knowledge Engine
                </h1>
                {serverOnline !== false ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Processing Server Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Processing server unavailable
                  </span>
                )}

                {supabaseOnline !== false ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Supabase Database: https://mpfncorbosznxjucssaq.supabase.co">
                    <Database className="w-3 h-3 text-emerald-600" />
                    Supabase Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Database className="w-3 h-3 text-amber-600" />
                    Supabase Connecting...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Canonical Document Ingestion, Section Hierarchy & Provenance Preservation
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </button>

            <button
              onClick={onOpenBatch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5 text-slate-500" />
              Batch Ingestion
            </button>

            <button
              onClick={onGenerateSamples}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Load Sample Guidelines
            </button>

            <button
              onClick={onOpenTests}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
            >
              <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
              Run Pytest (14 Tests)
            </button>

            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh inventory and stats"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Global Metric Strips */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-3 pt-3 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Total Docs</span>
              <span className="font-bold text-slate-800 font-mono text-sm">{stats.total}</span>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-lg p-2 flex items-center justify-between">
              <span className="text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Completed
              </span>
              <span className="font-bold text-emerald-800 font-mono text-sm">{stats.completed}</span>
            </div>

            <div className="bg-amber-50/60 border border-amber-200/70 rounded-lg p-2 flex items-center justify-between">
              <span className="text-amber-700 font-medium flex items-center gap-1">
                <Copy className="w-3 h-3 text-amber-500" /> Deduplicated
              </span>
              <span className="font-bold text-amber-800 font-mono text-sm">{stats.duplicate}</span>
            </div>

            <div className="bg-rose-50/60 border border-rose-200/70 rounded-lg p-2 flex items-center justify-between">
              <span className="text-rose-700 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-500" /> Failed
              </span>
              <span className="font-bold text-rose-800 font-mono text-sm">{stats.failed}</span>
            </div>

            <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-lg p-2 flex items-center justify-between">
              <span className="text-indigo-700 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-500" /> Section Nodes
              </span>
              <span className="font-bold text-indigo-800 font-mono text-sm">{stats.totalSections}</span>
            </div>

            <div className="bg-purple-50/60 border border-purple-200/70 rounded-lg p-2 flex items-center justify-between">
              <span className="text-purple-700 font-medium flex items-center gap-1">
                <Activity className="w-3 h-3 text-purple-500" /> Clinical Markers
              </span>
              <span className="font-bold text-purple-800 font-mono text-sm">{stats.totalClinicalMarkers}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
