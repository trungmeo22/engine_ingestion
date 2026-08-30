import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  Upload,
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
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  loading,
  serverOnline = true,
  supabaseOnline = true,
  onRefresh,
  onOpenUpload,
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
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
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

          {/* Primary actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-slate-100 text-xs">
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
          </div>
        )}
      </div>
    </header>
  );
};
