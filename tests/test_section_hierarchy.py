import pytest

from engines.document_parser import DocumentParser
from schemas.document import DocumentRecord
from schemas.provenance import BoundingBox


def test_numbered_section_hierarchy_5_5_1_5_1_1():
    parser = DocumentParser()

    doc_record = DocumentRecord(
        document_id="doc_hierarchy_test",
        file_name="guideline_section_test.txt",
        file_path="/tmp/test.txt",
        file_extension=".txt",
        file_hash="hash_test_123",
        title="Heart Failure Guideline Test",
    )

    raw_items = [
        {
            "type": "heading",
            "text": "5. Heart failure treatment",
            "page": 1,
            "bbox": BoundingBox(l=40, t=100, r=500, b=120),
        },
        {
            "type": "paragraph",
            "text": "General therapeutic principles for HF management.",
            "page": 1,
            "bbox": BoundingBox(l=40, t=130, r=500, b=160),
        },
        {
            "type": "heading",
            "text": "5.1. Pharmacological treatment",
            "page": 1,
            "bbox": BoundingBox(l=40, t=170, r=500, b=190),
        },
        {
            "type": "paragraph",
            "text": "Medical therapy constitutes the foundation of disease-modifying intervention.",
            "page": 1,
            "bbox": BoundingBox(l=40, t=200, r=500, b=230),
        },
        {
            "type": "heading",
            "text": "5.1.1. Sodium-glucose co-transporter 2 inhibitors",
            "page": 2,
            "bbox": BoundingBox(l=40, t=80, r=500, b=100),
        },
        {
            "type": "paragraph",
            "text": "Dapagliflozin and Empagliflozin are recommended for all patients with HFrEF (Class I, Level A).",
            "page": 2,
            "bbox": BoundingBox(l=40, t=110, r=500, b=150),
        },
        {
            "type": "heading",
            "text": "5.1.2. Beta-blockers",
            "page": 2,
            "bbox": BoundingBox(l=40, t=160, r=500, b=180),
        },
        {
            "type": "heading",
            "text": "6. Device therapy",
            "page": 3,
            "bbox": BoundingBox(l=40, t=80, r=500, b=100),
        },
    ]

    sections, item_sec_map = parser._build_section_tree(raw_items, doc_record)

    sec_map = {s.numbering_path: s for s in sections if s.numbering_path}

    # Verify Section 5 (level 1)
    sec_5 = sec_map["5"]
    assert sec_5.level == 1
    assert sec_5.parent_section_id is None
    assert "5. Heart failure treatment" in sec_5.title
    assert sec_5.breadcrumb == "5. Heart failure treatment"

    # Verify Section 5.1 (level 2)
    sec_5_1 = sec_map["5.1"]
    assert sec_5_1.level == 2
    assert sec_5_1.parent_section_id == sec_5.section_id
    assert "5.1. Pharmacological treatment" in sec_5_1.title
    assert sec_5_1.breadcrumb == "5. Heart failure treatment > 5.1. Pharmacological treatment"

    # Verify Section 5.1.1 (level 3)
    sec_5_1_1 = sec_map["5.1.1"]
    assert sec_5_1_1.level == 3
    assert sec_5_1_1.parent_section_id == sec_5_1.section_id
    assert "5.1.1. Sodium-glucose co-transporter 2 inhibitors" in sec_5_1_1.title
    assert sec_5_1_1.breadcrumb == "5. Heart failure treatment > 5.1. Pharmacological treatment > 5.1.1. Sodium-glucose co-transporter 2 inhibitors"

    # Verify Section 5.1.2 (level 3) sibling
    sec_5_1_2 = sec_map["5.1.2"]
    assert sec_5_1_2.level == 3
    assert sec_5_1_2.parent_section_id == sec_5_1.section_id

    # Verify Section 6 (level 1) returns to top level
    sec_6 = sec_map["6"]
    assert sec_6.level == 1
    assert sec_6.parent_section_id is None


def test_semantic_units_inherit_correct_section_and_breadcrumb():
    parser = DocumentParser()

    doc_record = DocumentRecord(
        document_id="doc_su_inheritance_test",
        file_name="guideline_sglt2.txt",
        file_path="/tmp/sglt2.txt",
        file_extension=".txt",
        file_hash="hash_su_456",
        title="SGLT2 Guideline",
    )

    raw_items = [
        {
            "type": "heading",
            "text": "5. Heart failure treatment",
            "page": 1,
            "bbox": BoundingBox(l=40, t=100, r=500, b=120),
        },
        {
            "type": "heading",
            "text": "5.1. Pharmacological treatment",
            "page": 1,
            "bbox": BoundingBox(l=40, t=170, r=500, b=190),
        },
        {
            "type": "heading",
            "text": "5.1.1. Sodium-glucose co-transporter 2 inhibitors",
            "page": 2,
            "bbox": BoundingBox(l=40, t=80, r=500, b=100),
        },
        {
            "type": "paragraph",
            "text": "Dapagliflozin (10 mg once daily) is recommended for all patients with HFrEF to reduce hospitalization (Class I, Level A).",
            "page": 2,
            "bbox": BoundingBox(l=40, t=110, r=500, b=150),
        },
    ]

    sections, item_sec_map = parser._build_section_tree(raw_items, doc_record)
    semantic_units = parser._build_semantic_units(raw_items, doc_record, sections, item_sec_map)

    # Unit 3 is the paragraph under 5.1.1
    p_unit = semantic_units[3]
    assert p_unit.unit_type == "paragraph"
    assert p_unit.section_id == "sec_5_1_1"
    assert p_unit.breadcrumb == "5. Heart failure treatment > 5.1. Pharmacological treatment > 5.1.1. Sodium-glucose co-transporter 2 inhibitors"
    assert p_unit.provenance.page == 2
    assert p_unit.provenance.bbox.l == 40.0
    assert p_unit.classification == "clinical_marker"


def test_duplicate_numbered_sections_disambiguation():
    """Validates that duplicate numbered headings (e.g. repeated 5. or 6. in TOC and body, or repeated lists)

    generate unique, valid, acyclic section IDs without failing validation.
    """
    from engines.validator import DocumentValidator
    parser = DocumentParser()
    validator = DocumentValidator()

    doc_record = DocumentRecord(
        document_id="doc_dup_test",
        file_name="guideline_with_dup_numbers.txt",
        file_path="/tmp/dup_test.txt",
        file_extension=".txt",
        file_hash="hash_dup_789",
        title="Guideline With Repeated Section Numbers",
    )

    raw_items = [
        # Table of Contents part
        {"type": "heading", "text": "5. Heart Failure Treatment", "page": 1, "bbox": BoundingBox(l=40, t=100, r=500, b=120)},
        {"type": "paragraph", "text": "Summary line in TOC.", "page": 1, "bbox": BoundingBox(l=40, t=130, r=500, b=150)},
        {"type": "heading", "text": "6. Device Therapy", "page": 1, "bbox": BoundingBox(l=40, t=160, r=500, b=180)},
        
        # Main Body part with identical numbers
        {"type": "heading", "text": "5. Heart Failure Treatment (Detailed)", "page": 5, "bbox": BoundingBox(l=40, t=100, r=500, b=120)},
        {"type": "heading", "text": "5.1. Pharmacotherapy", "page": 5, "bbox": BoundingBox(l=40, t=140, r=500, b=160)},
        {"type": "paragraph", "text": "Full guidelines text.", "page": 5, "bbox": BoundingBox(l=40, t=170, r=500, b=200)},
        {"type": "heading", "text": "6. Device Therapy (Detailed)", "page": 8, "bbox": BoundingBox(l=40, t=100, r=500, b=120)},
        
        # References / list with repeated 5.
        {"type": "heading", "text": "5. Reference Five", "page": 12, "bbox": BoundingBox(l=40, t=100, r=500, b=120)},
    ]

    sections, item_sec_map = parser._build_section_tree(raw_items, doc_record)
    semantic_units = parser._build_semantic_units(raw_items, doc_record, sections, item_sec_map)

    from schemas.document import CanonicalDocument
    canonical_doc = CanonicalDocument(
        document=doc_record,
        sections=sections,
        semantic_units=semantic_units,
    )

    # Check all section_ids are unique
    sec_ids = [s.section_id for s in sections]
    assert len(sec_ids) == len(set(sec_ids)), f"Duplicate section IDs found: {sec_ids}"
    assert "sec_5" in sec_ids
    assert "sec_5_v2" in sec_ids
    assert "sec_5_v3" in sec_ids
    assert "sec_6" in sec_ids
    assert "sec_6_v2" in sec_ids

    # Validate with DocumentValidator
    val_res = validator.validate(canonical_doc)
    assert val_res.is_valid, f"Validation errors: {val_res.errors}"

