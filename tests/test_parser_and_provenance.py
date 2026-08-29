import pytest

from engines.document_parser import DocumentParser
from schemas.document import DocumentRecord
from schemas.provenance import BoundingBox
from schemas.semantic_unit import UnitClassification, UnitType


def test_clinical_marker_preservation_and_classification():
    parser = DocumentParser()

    # Short markers that must NOT be dropped by simple length thresholds
    assert parser._classify_semantic_unit("Class I", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("Level A", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("eGFR < 30 mL/min/1.73m2", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("BNP > 400 pg/mL", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("LVEF <= 40%", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("NYHA Class III symptoms", UnitType.paragraph) == UnitClassification.clinical_marker
    assert parser._classify_semantic_unit("Dose: 10 mg once daily", UnitType.paragraph) == UnitClassification.clinical_marker


def test_table_and_figure_semantic_units():
    parser = DocumentParser()
    doc_record = DocumentRecord(
        document_id="doc_table_fig_test",
        file_name="table_fig_doc.txt",
        file_path="/tmp/tbl.txt",
        file_extension=".txt",
        file_hash="hash_tbl_123",
        title="Table and Figure Document",
    )

    raw_items = [
        {
            "type": "figure",
            "text": "Figure 1: Diagnostic algorithm for acute heart failure presentation.",
            "page": 3,
            "bbox": BoundingBox(l=50, t=100, r=550, b=350),
        },
        {
            "type": "table",
            "text": "| Drug | Starting Dose | Target Dose |\n|---|---|---|\n| Dapagliflozin | 10 mg od | 10 mg od |",
            "page": 4,
            "bbox": BoundingBox(l=50, t=400, r=550, b=600),
        },
    ]

    sections, item_sec_map = parser._build_section_tree(raw_items, doc_record)
    units = parser._build_semantic_units(raw_items, doc_record, sections, item_sec_map)

    assert len(units) == 2

    # Figure unit
    fig_unit = units[0]
    assert fig_unit.unit_type == UnitType.figure
    assert fig_unit.provenance.page == 3
    assert fig_unit.provenance.bbox.b == 350

    # Table unit
    tbl_unit = units[1]
    assert tbl_unit.unit_type == UnitType.table
    assert tbl_unit.provenance.page == 4
    assert "| Dapagliflozin |" in tbl_unit.text
