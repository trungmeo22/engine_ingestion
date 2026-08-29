import logging
import os
import traceback
from pathlib import Path
from typing import Callable, List, Optional, Union

from config import settings
from engines.document_classifier import DocumentClassifier
from engines.document_manager import DocumentManager
from engines.document_parser import DocumentParser
from engines.job_manager import JobManager
from engines.validator import DocumentValidator
from schemas.document import (
    BatchSummary,
    CanonicalDocument,
    DocumentRecord,
    JobType,
    ProcessingStatus,
)

logger = logging.getLogger("medical_engine.batch_processor")


class BatchProcessor:
    """Production batch processing engine for ingestion, classification, parsing,

    validation, error isolation, and retry handling.
    """

    def __init__(
        self,
        doc_manager: Optional[DocumentManager] = None,
        classifier: Optional[DocumentClassifier] = None,
        parser: Optional[DocumentParser] = None,
        validator: Optional[DocumentValidator] = None,
        job_manager: Optional[JobManager] = None,
    ):
        self.doc_manager = doc_manager or DocumentManager()
        self.classifier = classifier or DocumentClassifier()
        self.parser = parser or DocumentParser()
        self.validator = validator or DocumentValidator()
        self.job_manager = job_manager or JobManager()

    def discover_files(self, input_dir: Union[str, Path]) -> List[Path]:
        """Discovers all supported medical document files in a directory."""
        in_path = Path(input_dir)
        if not in_path.exists():
            logger.warning(f"Input directory does not exist: {input_dir}")
            return []

        supported_exts = set(settings.supported_extensions)
        files = [
            p for p in in_path.rglob("*")
            if p.is_file() and p.suffix.lower() in supported_exts and not p.name.startswith(".")
        ]
        files.sort(key=lambda p: p.name.lower())
        logger.info(f"Discovered {len(files)} files in '{input_dir}'")
        return files

    def ingest_directory(
        self,
        input_dir: Union[str, Path],
        on_progress: Optional[Callable[[DocumentRecord, int, int], None]] = None,
    ) -> BatchSummary:
        """Processes an entire directory of documents with complete fault isolation."""
        files = self.discover_files(input_dir)
        summary = BatchSummary(total_discovered=len(files))

        for idx, file_path in enumerate(files):
            try:
                doc_record, is_dup = self.process_single_file(file_path)
                if is_dup:
                    summary.duplicate += 1
                elif doc_record.processing_status == ProcessingStatus.completed:
                    summary.completed += 1
                elif doc_record.processing_status == ProcessingStatus.failed:
                    summary.failed += 1
                else:
                    summary.processing += 1

                summary.documents.append(doc_record)

                if on_progress:
                    on_progress(doc_record, idx + 1, len(files))

            except Exception as e:
                logger.error(f"Critical unhandled error processing file '{file_path}': {e}\n{traceback.format_exc()}")
                summary.failed += 1

        logger.info(
            f"Batch completed: Total={summary.total_discovered}, "
            f"Completed={summary.completed}, Duplicates={summary.duplicate}, Failed={summary.failed}"
        )
        return summary

    def process_single_file(self, file_path: Union[str, Path]) -> tuple[DocumentRecord, bool]:
        """Runs the complete ingestion pipeline for a single file."""
        path_obj = Path(file_path)
        file_name = path_obj.name

        # 1. Register and Duplicate Detection
        doc_record, is_duplicate = self.doc_manager.register_document(
            file_source=path_obj,
            file_name=file_name,
            title_hint=path_obj.stem.replace("_", " ").replace("-", " "),
        )

        if is_duplicate:
            logger.info(f"[{doc_record.document_id}][batch] Document is duplicate; skipping pipeline execution")
            return doc_record, True

        # 2. Process through pipeline
        doc_record = self._execute_pipeline(doc_record)
        return doc_record, False

    def _execute_pipeline(self, doc_record: DocumentRecord) -> DocumentRecord:
        """Executes classification, parsing, validation, and storage for a registered document."""
        doc_id = doc_record.document_id

        # Update status to queued
        self.doc_manager.update_status(doc_id, ProcessingStatus.queued)
        job = self.job_manager.create_job(doc_id, JobType.parse, attempt=doc_record.retry_count + 1)
        self.job_manager.start_job(job.job_id)

        try:
            # Stage 1: Classification
            self.doc_manager.update_status(doc_id, ProcessingStatus.classifying)
            metadata = self.classifier.classify(doc_record)
            
            # Apply metadata to document record
            doc_record.title = metadata.title or doc_record.title
            doc_record.document_type = metadata.document_type
            doc_record.organization = metadata.organization
            doc_record.publication_year = metadata.publication_year
            doc_record.specialty = metadata.specialty
            doc_record.topics = metadata.topics
            doc_record.metadata = metadata
            self.doc_manager.repository.save_document(doc_record)

            # Stage 2: Parsing
            self.doc_manager.update_status(doc_id, ProcessingStatus.parsing)
            canonical_doc = self.parser.parse(doc_record)

            # Stage 3: Validation
            self.doc_manager.update_status(doc_id, ProcessingStatus.validating)
            val_result = self.validator.validate(canonical_doc)
            canonical_doc.validation_summary = val_result.to_dict()

            if not val_result.is_valid:
                error_msg = f"Validation failed: {'; '.join(val_result.errors[:3])}"
                self.doc_manager.update_status(doc_id, ProcessingStatus.failed, error_message=error_msg)
                self.job_manager.fail_job(job.job_id, error_msg)
                doc_record.processing_status = ProcessingStatus.failed
                doc_record.error_message = error_msg
                return doc_record

            # Stage 4: Storage of Canonical Document
            self.doc_manager.update_status(doc_id, ProcessingStatus.completed)
            self.job_manager.complete_job(job.job_id)
            doc_record.processing_status = ProcessingStatus.completed
            doc_record.error_message = None
            canonical_doc.document = doc_record
            self.doc_manager.save_canonical_document(canonical_doc)

            # Stage 5: Completion
            logger.info(f"[{doc_id}][pipeline] Successfully processed and saved canonical artifacts")
            return doc_record

        except Exception as e:
            err_trace = traceback.format_exc()
            err_summary = str(e) or "Pipeline execution error"
            logger.error(f"[{doc_id}][pipeline] Error encountered: {err_summary}\n{err_trace}")
            self.doc_manager.update_status(doc_id, ProcessingStatus.failed, error_message=err_summary)
            self.job_manager.fail_job(job.job_id, err_summary)
            doc_record.processing_status = ProcessingStatus.failed
            doc_record.error_message = err_summary
            return doc_record

    def retry_document(self, document_id: str) -> Optional[DocumentRecord]:
        """Retries a failed document up to max_retries."""
        doc = self.doc_manager.get_document(document_id)
        if not doc:
            logger.warning(f"Cannot retry non-existent document: {document_id}")
            return None

        if doc.retry_count >= settings.max_retries:
            logger.warning(f"[{document_id}][retry] Reached max retry limit ({settings.max_retries})")
            return doc

        doc.retry_count += 1
        doc.processing_status = ProcessingStatus.retrying
        self.doc_manager.repository.save_document(doc)
        logger.info(f"[{document_id}][retry] Initiating retry attempt {doc.retry_count}/{settings.max_retries}")

        return self._execute_pipeline(doc)
