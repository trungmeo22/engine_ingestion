import logging
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.upload import router as upload_router, taxonomy_router
from config import settings
from engines.document_manager import DocumentManager
from schemas.document import ProcessingStatus

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(settings.log_dir / "medical_engine.log", encoding="utf-8"),
    ],
)

logger = logging.getLogger("medical_engine.app")

app = FastAPI(
    title="Medical Knowledge Engine API",
    description="Production-ready medical document ingestion, classification, parsing, and canonical structuring.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api")
app.include_router(taxonomy_router, prefix="/api")
app.include_router(taxonomy_router, prefix="")



@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "medical-knowledge-engine", "version": "1.0.0"}


@app.get("/api/stats")
async def get_dashboard_stats():
    """Aggregates real-time document counts for dashboard analytics."""
    doc_mgr = DocumentManager()
    docs = doc_mgr.list_documents()

    total = len(docs)
    completed = sum(1 for d in docs if d.processing_status == ProcessingStatus.completed)
    processing = sum(
        1 for d in docs if d.processing_status in (
            ProcessingStatus.queued,
            ProcessingStatus.classifying,
            ProcessingStatus.parsing,
            ProcessingStatus.validating,
            ProcessingStatus.retrying,
        )
    )
    failed = sum(1 for d in docs if d.processing_status == ProcessingStatus.failed)
    duplicates = sum(1 for d in docs if d.processing_status == ProcessingStatus.duplicate)

    return {
        "total_documents": total,
        "completed": completed,
        "processing": processing,
        "failed": failed,
        "duplicate": duplicates,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
