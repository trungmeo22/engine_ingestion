import pytest

from engines.document_classifier import DocumentClassifier
from schemas.document import DocumentRecord, DocumentType


def test_esc_guideline_classification():
    classifier = DocumentClassifier(confidence_threshold=0.70)

    doc_record = DocumentRecord(
        document_id="doc_esc_hf_2023",
        file_name="ESC_Guidelines_for_the_Management_of_Heart_Failure_2023.pdf",
        file_path="/tmp/esc.pdf",
        file_extension=".pdf",
        file_hash="dummy_hash_1",
        title="ESC Guidelines for Heart Failure",
    )

    first_page_text = """
    2023 ESC Guidelines for the management of acute and chronic heart failure.
    Developed by the task force for the diagnosis and treatment of acute and chronic heart failure
    of the European Society of Cardiology (ESC).
    Authors/Task Force Members: Theresa A. McDonagh, Marco Metra, et al.
    European Heart Journal (2023) 44, 3627–3739.
    """

    headings = [
        "1. Preamble",
        "2. Introduction",
        "3. Definition and classification of heart failure",
        "4. Diagnostic pathway for patients with suspected heart failure",
        "5. Pharmacological treatments for heart failure with reduced ejection fraction",
    ]

    meta = classifier.classify(doc_record, first_page_text=first_page_text, headings=headings)

    assert meta.document_type == DocumentType.guideline
    assert meta.organization == "ESC"
    assert meta.specialty == "cardiology"
    assert "heart failure" in meta.topics
    assert meta.publication_year == 2023
    assert meta.confidence >= 0.70
    assert not meta.needs_llm_classification


def test_rct_classification():
    classifier = DocumentClassifier(confidence_threshold=0.70)

    doc_record = DocumentRecord(
        document_id="doc_dapa_hf",
        file_name="DAPA-HF_Dapagliflozin_in_Patients_with_Heart_Failure.pdf",
        file_path="/tmp/dapa.pdf",
        file_extension=".pdf",
        file_hash="dummy_hash_2",
        title="Dapagliflozin in Patients with Heart Failure",
    )

    first_page_text = """
    A Randomized Controlled Trial of Dapagliflozin in Patients with Heart Failure and Reduced Ejection Fraction.
    DAPA-HF Trial Investigators.
    New England Journal of Medicine, 2019.
    Methods: In this phase 3, double-blind, placebo-controlled trial, we randomly assigned patients with NYHA class II-IV heart failure.
    """

    meta = classifier.classify(doc_record, first_page_text=first_page_text, headings=[])

    assert meta.document_type == DocumentType.RCT
    assert meta.specialty == "cardiology"
    assert "heart failure" in meta.topics
    assert meta.confidence >= 0.70


def test_systematic_review_meta_analysis_classification():
    classifier = DocumentClassifier(confidence_threshold=0.70)

    doc_record = DocumentRecord(
        document_id="doc_sglt2_meta",
        file_name="SGLT2_inhibitors_systematic_review_meta_analysis.pdf",
        file_path="/tmp/meta.pdf",
        file_extension=".pdf",
        file_hash="dummy_hash_3",
        title="SGLT2 inhibitors in heart failure: A Systematic Review and Meta-Analysis",
    )

    first_page_text = "Systematic review and meta-analysis conducted following PRISMA guidelines."

    meta = classifier.classify(doc_record, first_page_text=first_page_text, headings=[])

    assert meta.document_type in (DocumentType.meta_analysis, DocumentType.systematic_review)
    assert meta.confidence >= 0.70
