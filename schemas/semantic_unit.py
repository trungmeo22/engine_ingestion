import sys
from pathlib import Path
_lib_dir = str(Path(__file__).resolve().parent.parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)

from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

from schemas.provenance import Provenance


class UnitType(str, Enum):
    heading = "heading"
    paragraph = "paragraph"
    table = "table"
    figure = "figure"
    footnote = "footnote"
    reference = "reference"


class UnitClassification(str, Enum):
    content = "content"
    clinical_marker = "clinical_marker"
    metadata = "metadata"
    noise = "noise"


class TableData(BaseModel):
    markdown: str = Field("", description="Markdown representation of the table")
    headers: List[str] = Field(default_factory=list, description="Column header strings")
    rows: List[List[str]] = Field(default_factory=list, description="Row values matrix")
    num_rows: int = Field(0, description="Total number of rows")
    num_cols: int = Field(0, description="Total number of columns")


class SemanticUnit(BaseModel):
    unit_id: str = Field(..., description="Unique ID for this unit (e.g. su_0001)")
    unit_index: int = Field(..., description="0-based sequential index within the document")
    document_id: str = Field(..., description="Foreign key to document_id")
    unit_type: UnitType = Field(..., description="Semantic unit type")
    classification: UnitClassification = Field(UnitClassification.content, description="Content category/filter classification")
    content_hash: str = Field(..., description="SHA-256 hash of unit content for deduplication/caching")
    text: str = Field(..., description="Raw or parsed textual content")
    table_data: Optional[TableData] = Field(None, description="Structured table content if unit_type is table")
    section_id: Optional[str] = Field(None, description="Enclosing section ID")
    heading_level: Optional[int] = Field(None, description="Heading level if unit_type is heading")
    breadcrumb: Optional[str] = Field(None, description="Inherited breadcrumb path from section")
    provenance: Optional[Provenance] = Field(None, description="Document/page/bounding box coordinate tracking")
