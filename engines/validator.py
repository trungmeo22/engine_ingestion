import logging
from typing import Any, Dict, List, Set

from schemas.document import CanonicalDocument

logger = logging.getLogger("medical_engine.validator")


class ValidationResult:

    def __init__(self):
        self.is_valid: bool = True
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def add_error(self, message: str) -> None:
        self.is_valid = False
        self.errors.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid": self.is_valid,
            "status": "PASS" if self.is_valid else "FAIL",
            "errors": self.errors,
            "warnings": self.warnings,
            "total_errors": len(self.errors),
            "total_warnings": len(self.warnings),
        }


class DocumentValidator:
    """Rigorous validator verifying structural integrity, relational consistency,

    provenance coordinates, and acyclic section hierarchies.
    """

    def validate(self, canonical_doc: CanonicalDocument) -> ValidationResult:
        doc = canonical_doc.document
        doc_id = doc.document_id
        logger.info(f"[{doc_id}][validation] Starting validation for canonical document")
        result = ValidationResult()

        # 1. Document ID Existence
        if not doc_id:
            result.add_error("Missing document_id in document record")

        # 2. Section ID Uniqueness & Verification
        section_ids: Set[str] = set()
        sec_dict = {}
        for sec in canonical_doc.sections:
            if not sec.section_id:
                result.add_error("Encountered section with empty section_id")
                continue
            if sec.section_id in section_ids:
                result.add_error(f"Duplicate section_id detected: '{sec.section_id}'")
            section_ids.add(sec.section_id)
            sec_dict[sec.section_id] = sec

        # 3. Section Hierarchy Acyclic Graph Check & Parent Existence
        for sec in canonical_doc.sections:
            if sec.parent_section_id:
                if sec.parent_section_id not in section_ids:
                    result.add_error(
                        f"Section '{sec.section_id}' references non-existent parent '{sec.parent_section_id}'"
                    )
                # Cycle detection
                visited = {sec.section_id}
                curr_parent = sec.parent_section_id
                while curr_parent:
                    if curr_parent in visited:
                        result.add_error(
                            f"Cyclic loop detected in section hierarchy at section '{curr_parent}'"
                        )
                        break
                    visited.add(curr_parent)
                    parent_obj = sec_dict.get(curr_parent)
                    curr_parent = parent_obj.parent_section_id if parent_obj else None

        # 4. Semantic Unit Verification (Uniqueness, Section Integrity, Provenance)
        unit_ids: Set[str] = set()
        for su in canonical_doc.semantic_units:
            # Check unit_id uniqueness
            if not su.unit_id:
                result.add_error(f"SemanticUnit at index {su.unit_index} has empty unit_id")
            elif su.unit_id in unit_ids:
                result.add_error(f"Duplicate unit_id detected: '{su.unit_id}'")
            unit_ids.add(su.unit_id)

            # Check document_id foreign key
            if su.document_id != doc_id:
                result.add_error(
                    f"Unit '{su.unit_id}' has mismatched document_id: expected '{doc_id}', got '{su.document_id}'"
                )

            # Check section_id validity
            if su.section_id and su.section_id not in section_ids:
                result.add_error(
                    f"Unit '{su.unit_id}' references non-existent section_id '{su.section_id}'"
                )

            # Check content hash existence
            if not su.content_hash:
                result.add_error(f"Unit '{su.unit_id}' is missing content_hash")

            # Check provenance
            if su.provenance:
                if su.provenance.page < 1:
                    result.add_error(f"Unit '{su.unit_id}' has invalid page number {su.provenance.page}")
                if su.provenance.document_id != doc_id:
                    result.add_warning(
                        f"Unit '{su.unit_id}' provenance document_id mismatch: '{su.provenance.document_id}'"
                    )
            else:
                result.add_warning(f"Unit '{su.unit_id}' has no provenance coordinates")

        if result.is_valid:
            logger.info(f"[{doc_id}][validation] Validation PASSED with {len(result.warnings)} warnings")
        else:
            logger.error(
                f"[{doc_id}][validation] Validation FAILED with {len(result.errors)} errors: {result.errors[:3]}"
            )

        return result
