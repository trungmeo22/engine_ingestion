import pytest

from engines.validator import DocumentValidator
from schemas.document import CanonicalDocument, DocumentRecord
from schemas.provenance import BoundingBox, Provenance
from schemas.section import Section
from schemas.semantic_unit import SemanticUnit, UnitClassification, UnitType


def test_validator_detects_broken_parent_references():
    validator = DocumentValidator()
    doc = DocumentRecord(
        document_id="doc_val_test_1",
        file_name="test.pdf",
        file_path="/tmp/test.pdf",
        file_extension=".pdf",
        file_hash="hash1",
    )

    # Broken section parent
    sec1 = Section(
        section_id="sec_5_1_1",
        document_id=doc.document_id,
        parent_section_id="sec_non_existent",
        title="Sub-treatment",
        level=3,
        order_index=0,
        breadcrumb="Test",
    )

    canonical = CanonicalDocument(document=doc, sections=[sec1], semantic_units=[])
    res = validator.validate(canonical)

    assert not res.is_valid
    assert any("non-existent parent" in err for err in res.errors)


def test_validator_detects_cyclic_hierarchy():
    validator = DocumentValidator()
    doc = DocumentRecord(
        document_id="doc_val_test_2",
        file_name="test.pdf",
        file_path="/tmp/test.pdf",
        file_extension=".pdf",
        file_hash="hash2",
    )

    # Cyclic reference sec_A -> sec_B -> sec_A
    sec_a = Section(
        section_id="sec_A",
        document_id=doc.document_id,
        parent_section_id="sec_B",
        title="Section A",
        level=1,
        order_index=0,
        breadcrumb="A",
    )
    sec_b = Section(
        section_id="sec_B",
        document_id=doc.document_id,
        parent_section_id="sec_A",
        title="Section B",
        level=2,
        order_index=1,
        breadcrumb="B",
    )

    canonical = CanonicalDocument(document=doc, sections=[sec_a, sec_b], semantic_units=[])
    res = validator.validate(canonical)

    assert not res.is_valid
    assert any("Cyclic loop" in err for err in res.errors)


def test_validator_passes_valid_canonical_document():
    validator = DocumentValidator()
    doc = DocumentRecord(
        document_id="doc_val_pass",
        file_name="guideline.txt",
        file_path="/tmp/guideline.txt",
        file_extension=".txt",
        file_hash="hash_pass",
    )

    sec1 = Section(
        section_id="sec_5",
        document_id=doc.document_id,
        parent_section_id=None,
        title="5. Heart Failure",
        level=1,
        order_index=0,
        numbering_path="5",
        breadcrumb="5. Heart Failure",
    )
    sec2 = Section(
        section_id="sec_5_1",
        document_id=doc.document_id,
        parent_section_id="sec_5",
        title="5.1. Pharmacological Treatment",
        level=2,
        order_index=1,
        numbering_path="5.1",
        breadcrumb="5. Heart Failure > 5.1. Pharmacological Treatment",
    )

    su = SemanticUnit(
        unit_id="su_0001",
        unit_index=0,
        document_id=doc.document_id,
        unit_type=UnitType.paragraph,
        classification=UnitClassification.content,
        content_hash="hash_content_1",
        text="Sample paragraph",
        section_id="sec_5_1",
        breadcrumb=sec2.breadcrumb,
        provenance=Provenance(
            document_id=doc.document_id,
            file_name=doc.file_name,
            page=1,
            bbox=BoundingBox(l=40, t=100, r=500, b=150),
        ),
    )

    canonical = CanonicalDocument(document=doc, sections=[sec1, sec2], semantic_units=[su])
    res = validator.validate(canonical)

    assert res.is_valid
    assert len(res.errors) == 0
