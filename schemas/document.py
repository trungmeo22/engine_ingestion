import sys
from pathlib import Path
_lib_dir = str(Path(__file__).resolve().parent.parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from schemas.provenance import Provenance
from schemas.section import Section
from schemas.semantic_unit import SemanticUnit


class ProcessingStatus(str, Enum):
    discovered = "discovered"
    queued = "queued"
    classifying = "classifying"
    parsing = "parsing"
    validating = "validating"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    retrying = "retrying"
    duplicate = "duplicate"


class DocumentType(str, Enum):
    guideline = "guideline"
    consensus = "consensus"
    position_statement = "position_statement"
    protocol = "protocol"
    rct = "rct"
    RCT = "RCT"
    systematic_review = "systematic_review"
    meta_analysis = "meta_analysis"
    observational_study = "observational_study"
    textbook = "textbook"
    review = "review"
    other = "other"
    unknown = "unknown"


class JobType(str, Enum):
    classify = "classify"
    parse = "parse"
    validate = "validate"
    extract_knowledge = "extract_knowledge"
    index = "index"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


def get_current_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DocumentMetadata(BaseModel):
    title: Optional[str] = None
    authors: List[str] = Field(default_factory=list)
    organization: Optional[str] = None
    publication_year: Optional[int] = None
    version: Optional[str] = None
    language: str = "en"
    specialty: Optional[str] = None
    specialties: List[str] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)
    document_type: DocumentType = DocumentType.unknown
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    needs_llm_classification: bool = False
    evidence_signals: List[str] = Field(default_factory=list)


class DocumentRecord(BaseModel):
    document_id: str = Field(..., description="Stable SHA-derived or UUID identifier")
    file_name: str
    file_path: str
    storage_path: str = ""
    file_extension: str
    mime_type: str = "application/pdf"
    file_size: int = 0
    file_hash: str = Field(..., description="SHA-256 hash of file content for exact deduplication")
    title: Optional[str] = None
    document_type: DocumentType = DocumentType.unknown
    organization: Optional[str] = None
    publication_year: Optional[int] = None
    version: Optional[str] = None
    language: str = "en"
    specialty: Optional[str] = None
    specialties: List[str] = Field(default_factory=list)
    source_authority: Optional[str] = None
    classification_source: Optional[str] = None
    classification_confidence: Optional[float] = None
    classification_metadata: Dict[str, Any] = Field(default_factory=dict)
    topics: List[str] = Field(default_factory=list)
    processing_status: ProcessingStatus = ProcessingStatus.discovered
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: str = Field(default_factory=get_current_utc_iso)
    updated_at: str = Field(default_factory=get_current_utc_iso)
    metadata: Optional[DocumentMetadata] = None
    total_sections: Optional[int] = None
    total_semantic_units: Optional[int] = None
    sections_count: Optional[int] = None
    semantic_units_count: Optional[int] = None


class JobRecord(BaseModel):
    job_id: str
    document_id: str
    job_type: JobType
    status: JobStatus = JobStatus.queued
    attempt: int = 1
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error_message: Optional[str] = None


class CanonicalDocument(BaseModel):
    document: DocumentRecord
    sections: List[Section] = Field(default_factory=list)
    semantic_units: List[SemanticUnit] = Field(default_factory=list)
    validation_summary: Optional[Dict[str, Any]] = None


class BatchSummary(BaseModel):
    total_discovered: int = 0
    completed: int = 0
    processing: int = 0
    failed: int = 0
    duplicate: int = 0
    retrying: int = 0
    documents: List[DocumentRecord] = Field(default_factory=list)
