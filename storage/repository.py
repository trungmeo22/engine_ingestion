import json
import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional

from schemas.document import (
    CanonicalDocument,
    DocumentRecord,
    JobRecord,
    JobStatus,
    ProcessingStatus,
    get_current_utc_iso,
)


class DocumentRepository(ABC):
    """Abstract repository for persisting and querying document metadata."""

    @abstractmethod
    def save_document(self, document: DocumentRecord) -> None:
        pass

    @abstractmethod
    def get_document(self, document_id: str) -> Optional[DocumentRecord]:
        pass

    @abstractmethod
    def get_document_by_hash(self, file_hash: str) -> Optional[DocumentRecord]:
        pass

    @abstractmethod
    def list_documents(self) -> List[DocumentRecord]:
        pass

    @abstractmethod
    def update_document_status(
        self, document_id: str, status: ProcessingStatus, error_message: Optional[str] = None
    ) -> Optional[DocumentRecord]:
        pass

    @abstractmethod
    def save_canonical_document(self, document_id: str, canonical_doc: CanonicalDocument) -> None:
        pass

    @abstractmethod
    def get_canonical_document(self, document_id: str) -> Optional[CanonicalDocument]:
        pass

    @abstractmethod
    def delete_document(self, document_id: str) -> bool:
        """Deletes a document record from metadata repository."""
        pass

    @abstractmethod
    def delete_canonical_document(self, document_id: str) -> bool:
        """Deletes canonical document output directory and all parsed artifacts."""
        pass


class JobRepository(ABC):
    """Abstract repository for persisting and querying job queue records."""

    @abstractmethod
    def save_job(self, job: JobRecord) -> None:
        pass

    @abstractmethod
    def get_job(self, job_id: str) -> Optional[JobRecord]:
        pass

    @abstractmethod
    def get_jobs_for_document(self, document_id: str) -> List[JobRecord]:
        pass

    @abstractmethod
    def list_jobs(self) -> List[JobRecord]:
        pass

    @abstractmethod
    def update_job_status(
        self, job_id: str, status: JobStatus, error_message: Optional[str] = None
    ) -> Optional[JobRecord]:
        pass

    @abstractmethod
    def delete_jobs_for_document(self, document_id: str) -> int:
        """Deletes all processing job records for a specific document_id."""
        pass


class LocalJSONRepository(DocumentRepository, JobRepository):
    """Local JSON-based implementation of Document and Job repositories."""

    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            self.data_dir = Path(os.getcwd()) / "storage_data" / "meta"
        else:
            self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.docs_file = self.data_dir / "documents.json"
        self.jobs_file = self.data_dir / "jobs.json"
        self._init_files()

    def _init_files(self) -> None:
        if not self.docs_file.exists():
            self._write_json(self.docs_file, {})
        if not self.jobs_file.exists():
            self._write_json(self.jobs_file, {})

    def _read_json(self, file_path: Path) -> dict:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _write_json(self, file_path: Path, data: dict) -> None:
        temp_file = file_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_file.replace(file_path)

    # Document Repository methods
    def save_document(self, document: DocumentRecord) -> None:
        data = self._read_json(self.docs_file)
        data[document.document_id] = document.model_dump()
        self._write_json(self.docs_file, data)

    def get_document(self, document_id: str) -> Optional[DocumentRecord]:
        data = self._read_json(self.docs_file)
        doc_raw = data.get(document_id)
        if doc_raw:
            return DocumentRecord.model_validate(doc_raw)
        return None

    def get_document_by_hash(self, file_hash: str) -> Optional[DocumentRecord]:
        data = self._read_json(self.docs_file)
        for doc_raw in data.values():
            if doc_raw.get("file_hash") == file_hash:
                return DocumentRecord.model_validate(doc_raw)
        return None

    def list_documents(self) -> List[DocumentRecord]:
        data = self._read_json(self.docs_file)
        records = []
        for doc_raw in data.values():
            try:
                records.append(DocumentRecord.model_validate(doc_raw))
            except Exception:
                continue
        # Sort by created_at descending
        records.sort(key=lambda d: d.created_at, reverse=True)
        return records

    def update_document_status(
        self, document_id: str, status: ProcessingStatus, error_message: Optional[str] = None
    ) -> Optional[DocumentRecord]:
        doc = self.get_document(document_id)
        if not doc:
            return None
        doc.processing_status = status
        doc.updated_at = get_current_utc_iso()
        if error_message is not None:
            doc.error_message = error_message
        self.save_document(doc)
        return doc

    def save_canonical_document(self, document_id: str, canonical_doc: CanonicalDocument) -> None:
        doc_dir = Path(os.getcwd()) / "output" / document_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. document.json
        with open(doc_dir / "document.json", "w", encoding="utf-8") as f:
            json.dump(canonical_doc.document.model_dump(), f, indent=2, ensure_ascii=False)
            
        # 2. semantic_units.json
        with open(doc_dir / "semantic_units.json", "w", encoding="utf-8") as f:
            json.dump([su.model_dump() for su in canonical_doc.semantic_units], f, indent=2, ensure_ascii=False)
            
        # 3. sections.json
        with open(doc_dir / "sections.json", "w", encoding="utf-8") as f:
            json.dump([s.model_dump() for s in canonical_doc.sections], f, indent=2, ensure_ascii=False)
            
        # 4. processing.json
        processing_summary = {
            "document_id": document_id,
            "status": canonical_doc.document.processing_status,
            "total_sections": len(canonical_doc.sections),
            "total_semantic_units": len(canonical_doc.semantic_units),
            "validation_summary": canonical_doc.validation_summary,
            "updated_at": canonical_doc.document.updated_at,
        }
        with open(doc_dir / "processing.json", "w", encoding="utf-8") as f:
            json.dump(processing_summary, f, indent=2, ensure_ascii=False)

    def get_canonical_document(self, document_id: str) -> Optional[CanonicalDocument]:
        doc = self.get_document(document_id)
        if not doc:
            return None
        doc_dir = Path(os.getcwd()) / "output" / document_id
        if not doc_dir.exists():
            return CanonicalDocument(document=doc)
            
        from schemas.section import Section
        from schemas.semantic_unit import SemanticUnit

        sections: List[Section] = []
        if (doc_dir / "sections.json").exists():
            with open(doc_dir / "sections.json", "r", encoding="utf-8") as f:
                sections = [Section.model_validate(s) for s in json.load(f)]
                
        semantic_units: List[SemanticUnit] = []
        if (doc_dir / "semantic_units.json").exists():
            with open(doc_dir / "semantic_units.json", "r", encoding="utf-8") as f:
                semantic_units = [SemanticUnit.model_validate(su) for su in json.load(f)]
                
        validation_summary = None
        if (doc_dir / "processing.json").exists():
            with open(doc_dir / "processing.json", "r", encoding="utf-8") as f:
                proc = json.load(f)
                validation_summary = proc.get("validation_summary")

        return CanonicalDocument(
            document=doc,
            sections=sections,
            semantic_units=semantic_units,
            validation_summary=validation_summary
        )

    # Job Repository methods
    def save_job(self, job: JobRecord) -> None:
        data = self._read_json(self.jobs_file)
        data[job.job_id] = job.model_dump()
        self._write_json(self.jobs_file, data)

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        data = self._read_json(self.jobs_file)
        raw = data.get(job_id)
        if raw:
            return JobRecord.model_validate(raw)
        return None

    def get_jobs_for_document(self, document_id: str) -> List[JobRecord]:
        data = self._read_json(self.jobs_file)
        jobs = []
        for raw in data.values():
            if raw.get("document_id") == document_id:
                try:
                    jobs.append(JobRecord.model_validate(raw))
                except Exception:
                    pass
        jobs.sort(key=lambda j: j.started_at or "", reverse=True)
        return jobs

    def list_jobs(self) -> List[JobRecord]:
        data = self._read_json(self.jobs_file)
        jobs = []
        for raw in data.values():
            try:
                jobs.append(JobRecord.model_validate(raw))
            except Exception:
                pass
        return jobs

    def update_job_status(
        self, job_id: str, status: JobStatus, error_message: Optional[str] = None
    ) -> Optional[JobRecord]:
        job = self.get_job(job_id)
        if not job:
            return None
        job.status = status
        if status == JobStatus.running and not job.started_at:
            job.started_at = get_current_utc_iso()
        elif status in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
            job.finished_at = get_current_utc_iso()
        if error_message is not None:
            job.error_message = error_message
        self.save_job(job)
        return job

    def delete_document(self, document_id: str) -> bool:
        """Deletes document record from documents.json."""
        data = self._read_json(self.docs_file)
        if document_id in data:
            del data[document_id]
            self._write_json(self.docs_file, data)
            return True
        return False

    def delete_canonical_document(self, document_id: str) -> bool:
        """Deletes canonical document output directory."""
        doc_dir = Path(os.getcwd()) / "output" / document_id
        if doc_dir.exists() and doc_dir.is_dir():
            shutil.rmtree(doc_dir, ignore_errors=True)
            return True
        return False

    def delete_jobs_for_document(self, document_id: str) -> int:
        """Deletes all jobs associated with a document_id from jobs.json."""
        data = self._read_json(self.jobs_file)
        initial_len = len(data)
        keys_to_delete = [
            k for k, v in data.items() if v.get("document_id") == document_id
        ]
        for k in keys_to_delete:
            del data[k]
        if keys_to_delete:
            self._write_json(self.jobs_file, data)
        return len(keys_to_delete)
