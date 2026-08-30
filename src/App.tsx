import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { DocumentList } from './components/DocumentList';
import { DocumentInspectorModal } from './components/DocumentInspectorModal';
import { UploadModal } from './components/UploadModal';
import { DocumentRecord, CanonicalDocument, DashboardStats } from './types';
import {
  checkBackendHealth,
  fetchDashboardStats,
  fetchDocuments,
  fetchCanonicalDocument,
  retryDocument,
  reprocessDocument,
  deleteDocument,
  deleteFailedDocuments,
} from './lib/api';
import { checkSupabaseConnection } from './lib/supabase';

const POLLING_INTERVAL_MS = 2000;
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const App: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [supabaseOnline, setSupabaseOnline] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [inspectDocId, setInspectDocId] = useState<string | null>(null);
  const [canonicalDoc, setCanonicalDoc] = useState<CanonicalDocument | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const processingStartTimesRef = useRef<Record<string, number>>({});

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMessage(null);

    try {
      const [health, supaHealth] = await Promise.allSettled([
        checkBackendHealth(),
        checkSupabaseConnection(),
      ]);

      if (health.status === 'fulfilled') {
        setServerOnline(health.value.ok);
      }
      if (supaHealth.status === 'fulfilled') {
        setSupabaseOnline(supaHealth.value.connected);
      } else {
        setSupabaseOnline(true);
      }

      const docsData = await fetchDocuments();
      setDocuments(docsData);

      const statsData = await fetchDashboardStats(docsData);
      setStats(statsData);

      const now = Date.now();
      docsData.forEach((doc) => {
        const isProcessing = ['queued', 'processing', 'classifying', 'parsing', 'validating'].includes(
          doc.processing_status
        );
        if (isProcessing) {
          if (!processingStartTimesRef.current[doc.document_id]) {
            processingStartTimesRef.current[doc.document_id] = now;
          }
        } else {
          delete processingStartTimesRef.current[doc.document_id];
        }
      });
    } catch (err: any) {
      console.warn('Dashboard data fetch notification:', err?.message || err);
      setServerOnline(false);
      setErrorMessage(err.message || 'Cannot connect to document processing server.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const hasActiveProcessing = documents.some((d) =>
    ['queued', 'processing', 'classifying', 'parsing', 'validating', 'retrying'].includes(d.processing_status)
  );

  useEffect(() => {
    if (!hasActiveProcessing && !inspectDocId) return;

    const intervalId = setInterval(async () => {
      const now = Date.now();
      let timeoutDetected = false;

      documents.forEach((doc) => {
        const startTime = processingStartTimesRef.current[doc.document_id];
        if (
          startTime &&
          now - startTime > PROCESSING_TIMEOUT_MS &&
          ['queued', 'processing'].includes(doc.processing_status)
        ) {
          timeoutDetected = true;
        }
      });

      if (timeoutDetected) {
        setErrorMessage('Document processing is taking longer than expected.');
      }

      await fetchData(true);

      if (inspectDocId) {
        try {
          const requestedDocId = inspectDocId;
          const updatedDoc = await fetchCanonicalDocument(requestedDocId);
          if (updatedDoc && requestedDocId === inspectDocId) {
            setCanonicalDoc(updatedDoc);
          }
        } catch (err) {
          console.warn('[Polling] Error updating active inspection:', err);
        }
      }
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hasActiveProcessing, inspectDocId, documents, fetchData]);

  const handleInspect = async (docId: string) => {
    setCanonicalDoc(null);
    setInspectDocId(docId);
    setInspectLoading(true);
    try {
      const doc = await fetchCanonicalDocument(docId);
      if (doc) {
        setCanonicalDoc(doc);
      }
    } catch (err: any) {
      console.error('Error loading canonical doc:', err);
    } finally {
      setInspectLoading(false);
    }
  };

  const closeInspector = () => {
    setInspectDocId(null);
    setCanonicalDoc(null);
    setInspectLoading(false);
  };

  const handleRetry = async (docId: string) => {
    try {
      setLoading(true);
      processingStartTimesRef.current[docId] = Date.now();
      const res = await retryDocument(docId);
      if (!res.success) {
        throw new Error(res.error || 'Failed to retry document processing');
      }
      await fetchData(true);
      if (inspectDocId === docId) {
        await handleInspect(docId);
      }
    } catch (err: any) {
      console.error('Error retrying doc:', err);
      setErrorMessage(err.message || 'Retry failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReprocess = async (docId: string) => {
    try {
      processingStartTimesRef.current[docId] = Date.now();
      setDocuments((prev) =>
        prev.map((d) => (d.document_id === docId ? { ...d, processing_status: 'processing' as const, error_message: null } : d))
      );
      const res = await reprocessDocument(docId);
      if (!res.success) {
        throw new Error(res.error || 'Failed to reprocess document');
      }
      await fetchData(true);
      if (inspectDocId === docId) {
        await handleInspect(docId);
      }
    } catch (err: any) {
      console.error('Error re-analyzing doc:', err);
      setErrorMessage(err.message || 'Re-analysis request failed');
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const updatedDocs = documents.filter((d) => d.document_id !== docId);
      setDocuments(updatedDocs);
      const updatedStats = await fetchDashboardStats(updatedDocs);
      setStats(updatedStats);

      if (inspectDocId === docId) {
        closeInspector();
      }

      await deleteDocument(docId);
      await fetchData(true);
    } catch (err: any) {
      console.error('Error deleting doc:', err);
      setErrorMessage(err.message || 'Failed to delete document');
    }
  };

  const handleDeleteAllFailed = async () => {
    try {
      const updatedDocs = documents.filter(
        (d) =>
          d.processing_status !== 'failed' &&
          (d as any).status !== 'failed' &&
          !Boolean(d.error_message) &&
          (d as any).is_valid !== false
      );
      setDocuments(updatedDocs);
      const updatedStats = await fetchDashboardStats(updatedDocs);
      setStats(updatedStats);

      if (inspectDocId) {
        const inspectedDoc = documents.find((d) => d.document_id === inspectDocId);
        if (
          inspectedDoc &&
          (inspectedDoc.processing_status === 'failed' ||
            (inspectedDoc as any).status === 'failed' ||
            Boolean(inspectedDoc.error_message))
        ) {
          closeInspector();
        }
      }

      const res = await deleteFailedDocuments();
      if (!res.success && res.error) {
        throw new Error(res.error);
      }
      await fetchData(true);
    } catch (err: any) {
      console.error('Error deleting all failed docs:', err);
      setErrorMessage(err.message || 'Failed to delete failed documents');
      await fetchData(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header
        stats={stats}
        loading={loading}
        serverOnline={serverOnline}
        supabaseOnline={supabaseOnline}
        onRefresh={() => fetchData(false)}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {errorMessage ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold">Backend Status:</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => fetchData(false)}
              className="text-amber-950 font-semibold underline hover:no-underline ml-3 cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : serverOnline === false ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full">
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="font-bold">Notice:</span>
              <span>
                Document Management API on VPS is temporarily offline. Showing cached documents.
              </span>
            </div>
            <button
              onClick={() => fetchData(false)}
              className="text-amber-950 font-semibold underline hover:no-underline ml-3 cursor-pointer"
            >
              Check Again
            </button>
          </div>
        </div>
      ) : null}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        <DocumentList
          documents={documents}
          loading={loading}
          onInspect={handleInspect}
          onRetry={handleRetry}
          onReprocess={handleReprocess}
          onDelete={handleDelete}
          onDeleteAllFailed={handleDeleteAllFailed}
          onGenerateSamples={() => setIsUploadOpen(true)}
          onMetadataUpdated={async () => {
            await fetchData(true);
          }}
        />
      </main>

      {inspectDocId && canonicalDoc && (
        <DocumentInspectorModal
          document={canonicalDoc}
          loading={inspectLoading}
          onClose={closeInspector}
          onRetry={handleRetry}
          onReprocess={handleReprocess}
          onDelete={handleDelete}
          onMetadataUpdated={async () => {
            await fetchData(true);
            if (inspectDocId) {
              await handleInspect(inspectDocId);
            }
          }}
        />
      )}

      {isUploadOpen && (
        <UploadModal
          isOpen={true}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={async (newDocId) => {
            processingStartTimesRef.current[newDocId] = Date.now();
            await fetchData(true);
          }}
        />
      )}

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Medical Knowledge Engine • Connected to VPS Document Management API • Parser-Only Pipeline
      </footer>
    </div>
  );
};

export default App;
