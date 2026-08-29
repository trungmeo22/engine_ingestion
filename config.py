import os
import sys
from pathlib import Path

# Ensure ./lib is in python search path
_lib_dir = str(Path(__file__).resolve().parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from pydantic import BaseModel, Field


class Settings(BaseModel):
    # Base paths
    base_dir: Path = Field(default_factory=lambda: Path(os.getcwd()))
    input_dir: Path = Field(default_factory=lambda: Path(os.getcwd()) / "input")
    output_dir: Path = Field(default_factory=lambda: Path(os.getcwd()) / "output")
    log_dir: Path = Field(default_factory=lambda: Path(os.getcwd()) / "logs")
    
    # Classification settings
    classification_confidence_threshold: float = 0.70
    enable_llm_classification_fallback: bool = False
    
    # Processing & Retry
    max_retries: int = 3
    supported_extensions: list[str] = [".pdf", ".docx", ".txt"]
    
    # Storage & Database Abstractions
    storage_backend: str = "local"  # "local" | "supabase" | "s3" | "gcs"
    repository_backend: str = "local_json"  # "local_json" | "supabase"
    
    def ensure_directories(self) -> None:
        self.input_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
