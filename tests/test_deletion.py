import unittest
import os
import sys
import shutil
import tempfile
from pathlib import Path

# Setup paths
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from storage.repository import LocalJSONRepository
from storage.local_storage import LocalStorage
from engines.document_manager import DocumentManager
from app.models.document import DocumentRecord, ProcessingStatus

class TestHardDeletion(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.storage_dir = Path(self.temp_dir) / "storage"
        self.output_dir = Path(self.temp_dir) / "output"
        self.meta_dir = self.storage_dir / "meta"
        self.raw_dir = self.storage_dir / "raw"
        self.meta_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.repo = LocalJSONRepository(data_dir=str(self.storage_dir))
        self.storage = LocalStorage(base_dir=str(self.storage_dir))
        self.manager = DocumentManager(
            repository=self.repo,
            storage=self.storage,
            output_dir=str(self.output_dir)
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_delete_failed_document_hard_delete(self):
        # 1. Setup a failed document with fake 34-byte corrupted file
        doc_id = "doc_failed_123"
        raw_file_dir = self.raw_dir / doc_id
        raw_file_dir.mkdir(parents=True, exist_ok=True)
        raw_file = raw_file_dir / "corrupted.pdf"
        with open(raw_file, "wb") as f:
            f.write(b"%PDF-1.4\ncorrupted_34_bytes_content")

        # Fake canonical output directory
        canonical_dir = self.output_dir / doc_id
        canonical_dir.mkdir(parents=True, exist_ok=True)
        with open(canonical_dir / "canonical.json", "w") as f:
            f.write("{}")

        doc = DocumentRecord(
            document_id=doc_id,
            file_name="corrupted.pdf",
            file_path=str(raw_file),
            storage_path=f"raw/{doc_id}/corrupted.pdf",
            file_extension=".pdf",
            mime_type="application/pdf",
            file_size=34,
            file_hash="fakehash123",
            title="Corrupted Guideline",
            processing_status=ProcessingStatus.FAILED,
            error_message="PDFium: Data format error"
        )
        self.repo.save_document(doc)

        # Verify initial existence
        self.assertIsNotNone(self.repo.get_document(doc_id))
        self.assertTrue(raw_file.exists())
        self.assertTrue(canonical_dir.exists())

        # 2. Execute delete
        success = self.manager.delete_document(doc_id)
        self.assertTrue(success)

        # 3. Verify hard deletion
        self.assertIsNone(self.repo.get_document(doc_id))
        self.assertFalse(raw_file_dir.exists())
        self.assertFalse(canonical_dir.exists())

    def test_cannot_delete_completed_document_without_force(self):
        doc_id = "doc_completed_456"
        doc = DocumentRecord(
            document_id=doc_id,
            file_name="valid.pdf",
            file_path="raw/doc_completed_456/valid.pdf",
            storage_path="raw/doc_completed_456/valid.pdf",
            file_extension=".pdf",
            mime_type="application/pdf",
            file_size=10240,
            file_hash="validhash456",
            title="ESC Heart Failure 2023",
            processing_status=ProcessingStatus.COMPLETED
        )
        self.repo.save_document(doc)

        success, msg, code = self.manager.delete_document(doc_id, force=False)
        self.assertFalse(success)
        self.assertEqual(code, 409)

        # Document must remain untouched
        self.assertIsNotNone(self.repo.get_document(doc_id))

    def test_bulk_delete_failed_documents(self):
        # Create 2 failed docs and 1 completed doc
        for i in [1, 2]:
            doc_id = f"doc_failed_{i}"
            raw_file_dir = self.raw_dir / doc_id
            raw_file_dir.mkdir(parents=True, exist_ok=True)
            with open(raw_file_dir / "bad.pdf", "wb") as f:
                f.write(b"bad_bytes")

            doc = DocumentRecord(
                document_id=doc_id,
                file_name=f"bad_{i}.pdf",
                file_path=str(raw_file_dir / "bad.pdf"),
                storage_path=f"raw/{doc_id}/bad.pdf",
                file_extension=".pdf",
                mime_type="application/pdf",
                file_size=40,
                file_hash=f"badhash{i}",
                title=f"Failed Guideline {i}",
                processing_status=ProcessingStatus.FAILED,
                error_message="PDFium: Data format error"
            )
            self.repo.save_document(doc)

        comp_doc = DocumentRecord(
            document_id="doc_completed_safe",
            file_name="safe.pdf",
            file_path="raw/doc_completed_safe/safe.pdf",
            storage_path="raw/doc_completed_safe/safe.pdf",
            file_extension=".pdf",
            mime_type="application/pdf",
            file_size=50000,
            file_hash="safehash",
            title="Safe Completed Document",
            processing_status=ProcessingStatus.COMPLETED
        )
        self.repo.save_document(comp_doc)

        # Execute bulk delete
        report = self.manager.delete_failed_documents()

        self.assertEqual(report["deleted_count"], 2)
        self.assertIn("doc_failed_1", report["deleted_documents"])
        self.assertIn("doc_failed_2", report["deleted_documents"])

        # Verify failed docs are completely wiped
        self.assertIsNone(self.repo.get_document("doc_failed_1"))
        self.assertIsNone(self.repo.get_document("doc_failed_2"))

        # Verify completed doc is unaffected
        self.assertIsNotNone(self.repo.get_document("doc_completed_safe"))

if __name__ == "__main__":
    unittest.main()
