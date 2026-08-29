import hashlib
import tempfile
from pathlib import Path
import pytest

from engines.document_manager import DocumentManager
from schemas.document import ProcessingStatus
from storage.local_storage import LocalStorage
from storage.repository import LocalJSONRepository


def test_hash_calculation_and_stability():
    content = b"ESC Guidelines for the Management of Heart Failure 2023 - Official Document"
    expected_hash = hashlib.sha256(content).hexdigest()

    calc_hash = DocumentManager.compute_sha256(content)
    assert calc_hash == expected_hash

    # Hash should be deterministic and stable
    doc_id = DocumentManager.generate_document_id(calc_hash)
    assert doc_id.startswith("doc_")
    assert len(doc_id) == 20  # doc_ + 16 chars


def test_duplicate_detection_and_idempotency():
    with tempfile.TemporaryDirectory() as tmp_dir:
        storage_dir = Path(tmp_dir) / "storage"
        meta_dir = Path(tmp_dir) / "meta"

        storage = LocalStorage(root_dir=storage_dir)
        repo = LocalJSONRepository(data_dir=meta_dir)
        doc_mgr = DocumentManager(repository=repo, storage=storage)

        file_bytes = b"Randomized Controlled Trial of Empagliflozin in Heart Failure"

        # First registration
        doc1, is_dup1 = doc_mgr.register_document(
            file_source=file_bytes,
            file_name="trial_study.pdf",
            title_hint="Empagliflozin Trial",
        )
        assert not is_dup1
        assert doc1.document_id.startswith("doc_")
        assert doc1.file_size == len(file_bytes)

        # Second registration with SAME content but DIFFERENT filename
        doc2, is_dup2 = doc_mgr.register_document(
            file_source=file_bytes,
            file_name="renamed_trial_study.pdf",
            title_hint="Renamed Trial",
        )
        assert is_dup2
        # Must return the SAME document_id as doc1
        assert doc2.document_id == doc1.document_id
        assert doc2.file_hash == doc1.file_hash

        # Repository should still have only 1 document
        all_docs = repo.list_documents()
        assert len(all_docs) == 1
