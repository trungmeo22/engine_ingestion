import logging
import uuid
from typing import List, Optional

from schemas.document import (
    JobRecord,
    JobStatus,
    JobType,
    get_current_utc_iso,
)
from storage.repository import JobRepository, LocalJSONRepository

logger = logging.getLogger("medical_engine.job_manager")


class JobManager:
    """Manages asynchronous processing jobs, state transitions, and retry executions."""

    def __init__(self, repository: Optional[JobRepository] = None):
        self.repository = repository or LocalJSONRepository()

    def create_job(self, document_id: str, job_type: JobType, attempt: int = 1) -> JobRecord:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        now = get_current_utc_iso()
        job = JobRecord(
            job_id=job_id,
            document_id=document_id,
            job_type=job_type,
            status=JobStatus.queued,
            attempt=attempt,
            started_at=None,
            finished_at=None,
            error_message=None,
        )
        self.repository.save_job(job)
        logger.info(f"[{document_id}][{job_id}][queue] Created {job_type.value} job (attempt {attempt})")
        return job

    def start_job(self, job_id: str) -> Optional[JobRecord]:
        job = self.repository.update_job_status(job_id, JobStatus.running)
        if job:
            logger.info(f"[{job.document_id}][{job_id}][{job.job_type.value}] Started job execution")
        return job

    def complete_job(self, job_id: str) -> Optional[JobRecord]:
        job = self.repository.update_job_status(job_id, JobStatus.completed)
        if job:
            logger.info(f"[{job.document_id}][{job_id}][{job.job_type.value}] Completed successfully")
        return job

    def fail_job(self, job_id: str, error_message: str) -> Optional[JobRecord]:
        job = self.repository.update_job_status(job_id, JobStatus.failed, error_message=error_message)
        if job:
            logger.error(f"[{job.document_id}][{job_id}][{job.job_type.value}] Job FAILED: {error_message}")
        return job

    def get_job(self, job_id: str) -> Optional[JobRecord]:
        return self.repository.get_job(job_id)

    def get_jobs_for_document(self, document_id: str) -> List[JobRecord]:
        return self.repository.get_jobs_for_document(document_id)

    def list_jobs(self) -> List[JobRecord]:
        return self.repository.list_jobs()
