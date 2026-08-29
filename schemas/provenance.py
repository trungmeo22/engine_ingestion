import sys
from pathlib import Path
_lib_dir = str(Path(__file__).resolve().parent.parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from typing import Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    l: float = Field(0.0, description="Left X coordinate")
    t: float = Field(0.0, description="Top Y coordinate")
    r: float = Field(0.0, description="Right X coordinate")
    b: float = Field(0.0, description="Bottom Y coordinate")


class Provenance(BaseModel):
    document_id: str
    file_name: str
    page: int = Field(1, description="Page number (1-indexed)")
    bbox: BoundingBox = Field(default_factory=BoundingBox)
    coord_origin: str = Field("top-left", description="Coordinate origin (top-left or bottom-left)")
