import hashlib
import logging
import mimetypes
import os
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Tuple, Union

from config import settings
from schemas.document import (
    CanonicalDocument,
    DocumentRecord,
    DocumentType,
    ProcessingStatus,
    get_current_utc_iso,
)
from storage.local_storage import LocalStorage, StorageBackend
from storage.repository import DocumentRepository, LocalJSONRepository

logger = logging.getLogger("medical_engine.document_manager")


class DocumentManager:
    """Manages the full lifecycle of medical documents, deduplication, and persistence."""

    def __init__(
        self,
        repository: Optional[DocumentRepository] = None,
        storage: Optional[StorageBackend] = None,
    ):
        self.repository = repository or LocalJSONRepository()
        self.storage = storage or LocalStorage()

    @staticmethod
    def compute_sha256(file_path_or_bytes: Union[str, Path, bytes, BinaryIO]) -> str:
        """Computes the SHA-256 hash of a file or byte stream."""
        hasher = hashlib.sha256()
        if isinstance(file_path_or_bytes, (str, Path)):
            with open(file_path_or_bytes, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    hasher.update(chunk)
        elif isinstance(file_path_or_bytes, bytes):
            hasher.update(file_path_or_bytes)
        elif hasattr(file_path_or_bytes, "read"):
            pos = file_path_or_bytes.tell() if hasattr(file_path_or_bytes, "tell") else 0
            for chunk in iter(lambda: file_path_or_bytes.read(65536), b""):
                hasher.update(chunk)
            if hasattr(file_path_or_bytes, "seek"):
                file_path_or_bytes.seek(pos)
        else:
            raise TypeError(f"Cannot hash type: {type(file_path_or_bytes)}")
        return hasher.hexdigest()

    @staticmethod
    def generate_document_id(file_hash: str) -> str:
        """Generates a stable document ID independent of filename."""
        # Use first 16 chars of hash for a clean stable identifier
        return f"doc_{file_hash[:16]}"

    def register_document(
        self,
        file_source: Union[str, Path, bytes],
        file_name: str,
        title_hint: Optional[str] = None,
    ) -> Tuple[DocumentRecord, bool]:
        """Registers a new document with SHA-256 deduplication.

        Returns (DocumentRecord, is_duplicate).
        """
        file_hash = self.compute_sha256(file_source)
        doc_id = self.generate_document_id(file_hash)

        # 1. Deduplication check
        existing_doc = self.repository.get_document_by_hash(file_hash)
        if existing_doc:
            logger.info(f"[{existing_doc.document_id}][register] Duplicate detected (hash={file_hash[:8]}...) - skipping re-creation")
            return existing_doc, True

        # 2. Extract file properties
        file_ext = Path(file_name).suffix.lower() or ".pdf"
        mime_type, _ = mimetypes.guess_type(file_name)
        mime_type = mime_type or "application/octet-stream"

        if isinstance(file_source, (str, Path)):
            file_size = Path(file_source).stat().st_size
            original_path = str(Path(file_source).resolve())
        else:
            file_size = len(file_source)
            original_path = f"memory://{file_name}"

        # 3. Store raw document in storage backend
        storage_subpath = f"raw/{doc_id}/{file_name}"
        stored_path = self.storage.save_file(file_source, storage_subpath)

        # 4. Create document record
        now = get_current_utc_iso()
        doc_record = DocumentRecord(
            document_id=doc_id,
            file_name=file_name,
            file_path=original_path,
            storage_path=stored_path,
            file_extension=file_ext,
            mime_type=mime_type,
            file_size=file_size,
            file_hash=file_hash,
            title=title_hint or Path(file_name).stem.replace("_", " ").replace("-", " "),
            document_type=DocumentType.unknown,
            processing_status=ProcessingStatus.discovered,
            error_message=None,
            retry_count=0,
            created_at=now,
            updated_at=now,
        )

        self.repository.save_document(doc_record)
        logger.info(f"[{doc_id}][register] Registered new document: '{file_name}' ({file_size} bytes)")
        return doc_record, False

    def get_document(self, document_id: str) -> Optional[DocumentRecord]:
        return self.repository.get_document(document_id)

    def get_document_by_hash(self, file_hash: str) -> Optional[DocumentRecord]:
        return self.repository.get_document_by_hash(file_hash)

    def list_documents(self) -> List[DocumentRecord]:
        return self.repository.list_documents()

    def update_status(
        self, document_id: str, status: ProcessingStatus, error_message: Optional[str] = None
    ) -> Optional[DocumentRecord]:
        logger.info(f"[{document_id}][status] Transitioning to -> {status.value}" + (f" (Error: {error_message})" if error_message else ""))
        return self.repository.update_document_status(document_id, status, error_message)

    def save_canonical_document(self, canonical_doc: CanonicalDocument) -> None:
        self.repository.save_canonical_document(canonical_doc.document.document_id, canonical_doc)

    def get_canonical_document(self, document_id: str) -> Optional[CanonicalDocument]:
        return self.repository.get_canonical_document(document_id)

    def delete_document(self, document_id: str, force: bool = True) -> Tuple[bool, str, int]:
        """Hard-deletes a document and all related artifacts (jobs, storage files, canonical output).
        
        Allows hard deletion of any document when force=True or status is failed.
        Returns (success: bool, message: str, status_code: int).
        """
        doc = self.repository.get_document(document_id)
        if not doc:
            # Also check if document is indexed under alternate key
            all_docs = self.repository.list_documents()
            doc = next((d for d in all_docs if d.document_id == document_id or d.file_hash == document_id), None)
            if not doc:
                logger.warning(f"[{document_id}][delete] Document not found for deletion.")
                return False, f"Document {document_id} not found.", 404

        # Enforce status == 'failed' constraint only if force is explicitly False
        if doc.processing_status != ProcessingStatus.failed and not force:
            logger.warning(
                f"[{document_id}][delete] Rejecting deletion: Status is '{doc.processing_status.value}', only 'failed' documents can be hard deleted."
            )
            return (
                False,
                f"Cannot delete document with status '{doc.processing_status.value}'. Only 'failed' documents can be deleted.",
                409,
            )

        logger.info(f"[{document_id}][delete] Commencing HARD DELETE of document '{doc.file_name}'...")

        # 1. Clean up storage files (storage_data/raw/{document_id}/...)
        storage_deleted = False
        try:
            if doc.storage_path:
                storage_deleted = self.storage.delete_file(doc.storage_path) or storage_deleted
            # Clean up directory raw/{document_id}
            dir_deleted = self.storage.delete_directory(f"raw/{document_id}")
            storage_deleted = storage_deleted or dir_deleted
        except Exception as e:
            logger.warning(f"[{document_id}][delete] Error cleaning storage: {e}")

        # 2. Clean up temporary / queued files in input directory
        try:
            for input_file in settings.input_dir.glob(f"{document_id}_*"):
                if input_file.is_file():
                    input_file.unlink(missing_ok=True)
            if doc.file_name:
                exact_input = settings.input_dir / doc.file_name
                if exact_input.is_file():
                    exact_input.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"[{document_id}][delete] Error cleaning input file: {e}")

        # 3. Clean up canonical parsed artifacts (output/{document_id}/...)
        try:
            self.repository.delete_canonical_document(document_id)
        except Exception as e:
            logger.warning(f"[{document_id}][delete] Error deleting canonical output: {e}")

        # 4. Clean up processing jobs
        jobs_deleted = 0
        try:
            if hasattr(self.repository, "delete_jobs_for_document"):
                jobs_deleted = self.repository.delete_jobs_for_document(document_id)
        except Exception as e:
            logger.warning(f"[{document_id}][delete] Error deleting jobs: {e}")

        # 5. Remove document record from metadata repository
        doc_deleted = self.repository.delete_document(document_id)

        logger.info(
            f"[{document_id}][delete] HARD DELETE completed: doc_record_deleted={doc_deleted}, jobs_deleted={jobs_deleted}, storage_cleaned={storage_deleted}"
        )
        return True, f"Document {document_id} permanently deleted.", 200

    def delete_failed_documents(self) -> Dict[str, Any]:
        """Hard-deletes all documents with status == 'failed' or validation errors.
        
        Returns a summary report of deleted records, storage files, and any errors.
        """
        all_docs = self.repository.list_documents()
        failed_docs = [
            d for d in all_docs
            if d.processing_status == ProcessingStatus.failed
            or bool(d.error_message)
            or "corrupt" in (d.file_name or "").lower()
            or "failed" in (d.file_name or "").lower()
        ]

        logger.info(f"[bulk_delete] Found {len(failed_docs)} failed/error documents to hard delete.")

        deleted_documents: List[str] = []
        errors: List[Dict[str, str]] = []
        storage_deleted_count = 0

        for doc in failed_docs:
            doc_id = doc.document_id
            success, msg, code = self.delete_document(doc_id, force=True)
            if success:
                deleted_documents.append(doc_id)
                storage_deleted_count += 1
            else:
                errors.append({"document_id": doc_id, "error": msg, "code": str(code)})

        return {
            "deleted_count": len(deleted_documents),
            "deleted_documents": deleted_documents,
            "storage_deleted": storage_deleted_count,
            "errors": errors,
        }

    def update_metadata(self, document_id: str, patch_data: Dict[str, Any]) -> Optional[DocumentRecord]:
        """Updates document metadata manually without invoking parser or LLM.
        
        Persists to repository and updates canonical document.json artifact if exists.
        """
        doc = self.repository.get_document(document_id)
        if not doc:
            return None

        # Update metadata fields
        if "source_authority" in patch_data:
            doc.source_authority = patch_data["source_authority"]
        if "document_type" in patch_data and patch_data["document_type"]:
            try:
                doc.document_type = DocumentType(patch_data["document_type"])
            except ValueError:
                pass
        if "organization" in patch_data:
            doc.organization = patch_data["organization"]
        if "publication_year" in patch_data:
            doc.publication_year = patch_data["publication_year"]
        if "language" in patch_data:
            doc.language = patch_data["language"]
        if "specialties" in patch_data:
            doc.specialties = patch_data["specialties"] or []
            if doc.specialties:
                doc.specialty = doc.specialties[0]
            else:
                doc.specialty = None
        elif "specialty" in patch_data:
            doc.specialty = patch_data["specialty"]
            if doc.specialty:
                doc.specialties = [doc.specialty]
            else:
                doc.specialties = []

        doc.classification_source = "manual_metadata"
        doc.classification_confidence = 1.0

        current_meta = getattr(doc, "classification_metadata", {}) or {}
        current_meta.update({
            "metadata_mode": "manual",
            "updated_via": "document_metadata_api",
            "updated_at": get_current_utc_iso(),
        })
        doc.classification_metadata = current_meta
        doc.updated_at = get_current_utc_iso()

        # Update nested metadata if present
        if doc.metadata:
            doc.metadata.document_type = doc.document_type
            doc.metadata.organization = doc.organization
            doc.metadata.publication_year = doc.publication_year
            doc.metadata.language = doc.language or "en"
            doc.metadata.specialty = doc.specialty
            doc.metadata.confidence = 1.0

        self.repository.save_document(doc)

        # Update canonical artifact if exists
        out_dir = settings.output_dir / document_id
        doc_json_path = out_dir / "document.json"
        if doc_json_path.exists():
            try:
                import json
                with open(doc_json_path, "w", encoding="utf-8") as f:
                    json.dump(doc.model_dump(), f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.warning(f"[{document_id}] Failed to update canonical document.json: {e}")

        return doc
