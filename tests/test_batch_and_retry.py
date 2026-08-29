import tempfile
from pathlib import Path
import pytest

from config import settings
from engines.batch_processor import BatchProcessor
from engines.document_manager import DocumentManager
from schemas.document import ProcessingStatus
from storage.local_storage import LocalStorage
from storage.repository import LocalJSONRepository


def test_batch_discovery_and_fault_isolation():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        input_dir = tmp_path / "input"
        storage_dir = tmp_path / "storage"
        meta_dir = tmp_path / "meta"
        input_dir.mkdir()

        # 1. Create a valid guideline document
        valid_file1 = input_dir / "ESC_Guidelines_Heart_Failure_2023.txt"
        valid_file1.write_text(
            "ESC Guidelines for the Management of Heart Failure 2023\n"
            "5. Pharmacological treatment\n"
            "5.1. SGLT2 inhibitors\n"
            "Dapagliflozin 10mg is recommended (Class I, Level A).\n",
            encoding="utf-8",
        )

        # 2. Create another valid trial document
        valid_file2 = input_dir / "DAPA_HF_Randomized_Trial.txt"
        valid_file2.write_text(
            "Randomized controlled trial of dapagliflozin in patients with heart failure.\n"
            "Results: SGLT2 inhibitors reduced cardiovascular death.\n",
            encoding="utf-8",
        )

        # 3. Create a third valid document (identical to file 1 to test duplicate in batch)
        dup_file = input_dir / "ESC_Copy.txt"
        dup_file.write_text(valid_file1.read_text(encoding="utf-8"), encoding="utf-8")

        storage = LocalStorage(root_dir=storage_dir)
        repo = LocalJSONRepository(data_dir=meta_dir)
        doc_mgr = DocumentManager(repository=repo, storage=storage)
        processor = BatchProcessor(doc_manager=doc_mgr)

        summary = processor.ingest_directory(input_dir)

        assert summary.total_discovered == 3
        assert summary.completed == 2
        assert summary.duplicate == 1
        assert summary.failed == 0


def test_retry_failed_document():
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        storage_dir = tmp_path / "storage"
        meta_dir = tmp_path / "meta"

        storage = LocalStorage(root_dir=storage_dir)
        repo = LocalJSONRepository(data_dir=meta_dir)
        doc_mgr = DocumentManager(repository=repo, storage=storage)
        processor = BatchProcessor(doc_manager=doc_mgr)

        # Register a document initially in failed state
        doc, _ = doc_mgr.register_document(
            file_source=b"5. Guidelines\nContent here with Class I evidence.",
            file_name="retry_sample.txt",
        )
        doc_mgr.update_status(doc.document_id, ProcessingStatus.failed, error_message="Simulated temporary timeout")

        assert doc_mgr.get_document(doc.document_id).processing_status == ProcessingStatus.failed

        # Retry the document
        retried_doc = processor.retry_document(doc.document_id)

        assert retried_doc is not None
        assert retried_doc.retry_count == 1
        assert retried_doc.processing_status == ProcessingStatus.completed
