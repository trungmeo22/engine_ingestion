import logging
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from config import settings
from engines.batch_processor import BatchProcessor
from engines.document_manager import DocumentManager
from schemas.document import (
    CanonicalDocument,
    DocumentRecord,
    DocumentType,
    ProcessingStatus,
)

logger = logging.getLogger("medical_engine.api")
router = APIRouter(prefix="/documents", tags=["documents"])
taxonomy_router = APIRouter(tags=["taxonomy"])

doc_manager = DocumentManager()
batch_processor = BatchProcessor(doc_manager=doc_manager)

VALID_SOURCE_AUTHORITIES = {"byt", "esc", "other"}

VALID_DOCUMENT_TYPES = {
    "guideline", "consensus", "position_statement", "protocol", "rct",
    "systematic_review", "meta_analysis", "observational_study", "textbook",
    "review", "other", "unknown"
}

VALID_SPECIALTIES = {
    "cardiology", "pulmonology", "endocrinology", "nephrology",
    "gastroenterology", "neurology", "infectious_disease", "oncology",
    "rheumatology", "dermatology", "hematology", "pediatrics",
    "intensive_care", "general_internal_medicine"
}

CANONICAL_SPECIALTIES_LIST = [
    {"code": "cardiology", "name": "Tim mạch"},
    {"code": "pulmonology", "name": "Hô hấp"},
    {"code": "endocrinology", "name": "Nội tiết - Đái tháo đường"},
    {"code": "nephrology", "name": "Thận học"},
    {"code": "gastroenterology", "name": "Tiêu hóa - Gan mật"},
    {"code": "neurology", "name": "Thần kinh"},
    {"code": "infectious_disease", "name": "Truyền nhiễm"},
    {"code": "oncology", "name": "Ung bướu"},
    {"code": "rheumatology", "name": "Cơ xương khớp"},
    {"code": "dermatology", "name": "Da liễu"},
    {"code": "hematology", "name": "Huyết học"},
    {"code": "pediatrics", "name": "Nhi khoa"},
    {"code": "intensive_care", "name": "Hồi sức cấp cứu"},
    {"code": "general_internal_medicine", "name": "Nội khoa tổng quát"},
]

CANONICAL_SOURCE_AUTHORITIES_LIST = [
    {"code": "byt", "name": "Bộ Y tế Việt Nam", "geographic_scope": "Vietnam", "authority_priority": 100},
    {"code": "esc", "name": "European Society of Cardiology", "geographic_scope": "International", "authority_priority": 90},
    {"code": "other", "name": "Nguồn khác", "geographic_scope": "Other", "authority_priority": 40},
]


class DocumentMetadataPatchRequest(BaseModel):
    source_authority: Optional[str] = None
    document_type: Optional[str] = None
    organization: Optional[str] = None
    publication_year: Optional[int] = None
    language: Optional[str] = None
    specialties: Optional[List[str]] = None
    specialty: Optional[str] = None


class UploadResponse(BaseModel):
    document_id: str
    file_name: str
    status: str
    is_duplicate: bool
    message: str


class BatchUploadResponse(BaseModel):
    total_received: int
    items: List[UploadResponse]


def _process_background(file_path: Path):
    try:
        batch_processor.process_single_file(file_path)
    except Exception as e:
        logger.error(f"Background processing error for {file_path}: {e}")


@router.post("", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title_hint: Optional[str] = Form(None),
):
    """Uploads a single medical document.

    Saves file, registers document record, queues worker, and returns immediately.
    """
    file_name = file.filename or "uploaded_document.pdf"
    content = await file.read()

    # Register immediately
    doc_record, is_duplicate = doc_manager.register_document(
        file_source=content,
        file_name=file_name,
        title_hint=title_hint or Path(file_name).stem.replace("_", " "),
    )

    if is_duplicate:
        return UploadResponse(
            document_id=doc_record.document_id,
            file_name=file_name,
            status=doc_record.processing_status.value,
            is_duplicate=True,
            message="Duplicate file detected. Document already exists in repository.",
        )

    # Save to input directory for batch processing
    input_file_path = settings.input_dir / f"{doc_record.document_id}_{file_name}"
    with open(input_file_path, "wb") as f:
        f.write(content)

    # Queue background task (non-blocking)
    background_tasks.add_task(_process_background, input_file_path)

    return UploadResponse(
        document_id=doc_record.document_id,
        file_name=file_name,
        status="queued",
        is_duplicate=False,
        message="Document uploaded and queued for processing.",
    )


@router.post("/batch", response_model=BatchUploadResponse)
async def upload_batch_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    """Uploads multiple medical documents simultaneously (1 to 100+ files)."""
    results: List[UploadResponse] = []

    for file in files:
        file_name = file.filename or "uploaded_file.pdf"
        content = await file.read()

        doc_record, is_duplicate = doc_manager.register_document(
            file_source=content,
            file_name=file_name,
            title_hint=Path(file_name).stem.replace("_", " "),
        )

        if is_duplicate:
            results.append(
                UploadResponse(
                    document_id=doc_record.document_id,
                    file_name=file_name,
                    status=doc_record.processing_status.value,
                    is_duplicate=True,
                    message="Duplicate document skipped.",
                )
            )
        else:
            input_file_path = settings.input_dir / f"{doc_record.document_id}_{file_name}"
            with open(input_file_path, "wb") as f:
                f.write(content)

            background_tasks.add_task(_process_background, input_file_path)
            results.append(
                UploadResponse(
                    document_id=doc_record.document_id,
                    file_name=file_name,
                    status="queued",
                    is_duplicate=False,
                    message="Queued for processing.",
                )
            )

    return BatchUploadResponse(total_received=len(files), items=results)


@router.get("", response_model=List[DocumentRecord])
async def list_all_documents():
    """Lists all documents registered in the system."""
    return doc_manager.list_documents()


@router.get("/{document_id}", response_model=DocumentRecord)
async def get_document_details(document_id: str):
    """Retrieves document record metadata by document_id."""
    doc = doc_manager.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/{document_id}/status")
async def get_document_status(document_id: str):
    """Retrieves current processing status, retry count, and errors."""
    doc = doc_manager.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "document_id": doc.document_id,
        "status": doc.processing_status,
        "retry_count": doc.retry_count,
        "error_message": doc.error_message,
        "updated_at": doc.updated_at,
    }


@router.get("/{document_id}/canonical", response_model=CanonicalDocument)
async def get_document_canonical(document_id: str):
    """Retrieves complete canonical document including section tree and semantic units."""
    canonical = doc_manager.get_canonical_document(document_id)
    if not canonical:
        raise HTTPException(status_code=404, detail="Canonical document artifacts not found")
    return canonical


@router.post("/{document_id}/retry", response_model=DocumentRecord)
async def retry_failed_document(document_id: str, background_tasks: BackgroundTasks):
    """Triggers retry for a failed or stuck document."""
    doc = doc_manager.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Run retry in background
    background_tasks.add_task(batch_processor.retry_document, document_id)
    doc.processing_status = ProcessingStatus.retrying
    return doc


@router.patch("/{document_id}/metadata", response_model=DocumentRecord)
async def update_document_metadata(document_id: str, patch: DocumentMetadataPatchRequest):
    """Manually updates document metadata without triggering re-ingest, parser, or LLM."""
    existing_doc = doc_manager.get_document(document_id)
    if not existing_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    clean_patch: Dict[str, Any] = {}

    # 1. Validate source_authority
    if patch.source_authority is not None:
        sa = patch.source_authority.strip().lower() if isinstance(patch.source_authority, str) else None
        if sa:
            if sa not in VALID_SOURCE_AUTHORITIES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid source_authority: '{patch.source_authority}'. Allowed: {sorted(VALID_SOURCE_AUTHORITIES)}",
                )
            clean_patch["source_authority"] = sa
        else:
            clean_patch["source_authority"] = None

    # 2. Validate document_type
    if patch.document_type is not None:
        dt = patch.document_type.strip().lower() if isinstance(patch.document_type, str) else None
        if dt:
            if dt not in VALID_DOCUMENT_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid document_type: '{patch.document_type}'. Allowed: {sorted(VALID_DOCUMENT_TYPES)}",
                )
            clean_patch["document_type"] = dt
        else:
            clean_patch["document_type"] = "unknown"

    # 3. Validate publication_year
    if patch.publication_year is not None:
        try:
            year_val = int(patch.publication_year)
            if year_val < 1900 or year_val > 2100:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid publication_year: {year_val}. Must be an integer between 1900 and 2100.",
                )
            clean_patch["publication_year"] = year_val
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid publication_year: '{patch.publication_year}'. Must be an integer between 1900 and 2100.",
            )

    # 4. Validate language
    if patch.language is not None:
        lang = patch.language.strip().lower() if isinstance(patch.language, str) else None
        if lang:
            if lang not in {"vi", "en", "other"}:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid language: '{patch.language}'. Allowed: 'vi', 'en', 'other'.",
                )
            clean_patch["language"] = lang
        else:
            clean_patch["language"] = None

    # 5. Validate organization
    if patch.organization is not None:
        org = patch.organization.strip() if isinstance(patch.organization, str) else ""
        clean_patch["organization"] = org if org else None

    # 6. Validate specialties
    if patch.specialties is not None:
        validated_specialties: List[str] = []
        for s in patch.specialties:
            if not isinstance(s, str):
                continue
            code = s.strip().lower()
            if not code:
                continue
            if code not in VALID_SPECIALTIES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid specialty code: '{s}'. Allowed codes: {sorted(VALID_SPECIALTIES)}",
                )
            if code not in validated_specialties:
                validated_specialties.append(code)
        clean_patch["specialties"] = validated_specialties
    elif patch.specialty is not None:
        sp = patch.specialty.strip().lower()
        if sp:
            if sp not in VALID_SPECIALTIES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid specialty code: '{patch.specialty}'. Allowed codes: {sorted(VALID_SPECIALTIES)}",
                )
            clean_patch["specialties"] = [sp]
        else:
            clean_patch["specialties"] = []

    # Update metadata
    updated_doc = doc_manager.update_metadata(document_id, clean_patch)
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    logger.info(f"[{document_id}] Manual metadata updated: {clean_patch}")
    return updated_doc


@taxonomy_router.get("/specialties", response_model=List[Dict[str, Any]])
async def get_specialties():
    """Returns canonical list of medical specialties."""
    return CANONICAL_SPECIALTIES_LIST


@taxonomy_router.get("/source-authorities", response_model=List[Dict[str, Any]])
async def get_source_authorities():
    """Returns list of active source authorities."""
    return CANONICAL_SOURCE_AUTHORITIES_LIST


@router.delete("/failed", response_model=Dict[str, Any])
async def delete_all_failed_documents():
    """Bulk hard-deletes all documents with status == 'failed'.
    
    Removes metadata records, associated jobs, canonical files, and storage files.
    """
    report = doc_manager.delete_failed_documents()
    return report


@router.delete("/{document_id}")
async def delete_failed_document(document_id: str):
    """Hard-deletes a document.
    
    Removes document metadata records, jobs, canonical files, and storage files.
    """
    success, message, status_code = doc_manager.delete_document(document_id, force=True)
    if not success:
        raise HTTPException(status_code=status_code, detail=message)

    return {
        "success": True,
        "document_id": document_id,
        "message": message,
    }
