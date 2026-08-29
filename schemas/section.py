import sys
from pathlib import Path
_lib_dir = str(Path(__file__).resolve().parent.parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from typing import Optional
from pydantic import BaseModel, Field


class Section(BaseModel):
    section_id: str = Field(..., description="Unique section identifier (e.g. sec_5_1_1)")
    document_id: str = Field(..., description="Foreign key to document_id")
    parent_section_id: Optional[str] = Field(None, description="Parent section ID for hierarchy tree")
    title: str = Field(..., description="Title of the section")
    level: int = Field(1, description="Hierarchical depth level (1, 2, 3, ...)")
    order_index: int = Field(0, description="Sequential order in document")
    numbering_path: Optional[str] = Field(None, description="Hierarchical numbering path (e.g. '5.1.1')")
    breadcrumb: str = Field(..., description="Full breadcrumb path (e.g. '5. Heart Failure > 5.1. Treatment')")
