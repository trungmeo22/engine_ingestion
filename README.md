# Medical Knowledge Engine

A production-ready medical document ingestion, classification, parsing, validation, and canonical structuring engine built with Python 3.10+, Pydantic v2, and modular abstraction layers.

## Architecture

```
medical-knowledge/
│
├── app/
│   ├── api/
│   │   └── upload.py        # FastAPI non-blocking upload & batch endpoints
│   │
│   └── main.py              # FastAPI app, stats, background tasks
│
├── engines/
│   ├── document_manager.py  # Lifecycle, SHA-256 deduplication, persistence
│   ├── document_classifier.py # Two-tier medical classifier (deterministic + LLM fallback)
│   ├── document_parser.py   # PDF/DOCX/TXT parser, 5->5.1->5.1.1 hierarchy, tables, figures
│   ├── batch_processor.py   # 1 to 1000+ files processor, error isolation, retries
│   ├── validator.py         # Structural, referential, acyclic hierarchy validation
│   └── job_manager.py       # Asynchronous job queue & status tracking
│
├── schemas/
│   ├── document.py          # DocumentRecord, ProcessingStatus, CanonicalDocument
│   ├── section.py           # Section tree, numbering paths, breadcrumbs
│   ├── semantic_unit.py     # SemanticUnit, TableData, clinical marker preservation
│   └── provenance.py        # Page, BoundingBox coordinates (l, t, r, b)
│
├── storage/
│   ├── local_storage.py     # StorageBackend abstraction (LocalStorage, S3, Supabase)
│   └── repository.py        # DocumentRepository & JobRepository abstractions
│
├── input/                   # Raw input documents folder
├── output/                  # Canonical output folder per document_id
├── logs/                    # Structured system execution logs
├── tests/                   # Comprehensive pytest test suite (10 test suites)
│
├── main.py                  # CLI command line interface
├── requirements.txt         # Dependencies
└── README.md
```

## Key Features

1. **SHA-256 Deduplication & Idempotency**: Prevents re-ingesting identical files.
2. **Deterministic & Two-Tier Classification**: Identifies guidelines, RCTs, meta-analyses, medical specialties (cardiology, nephrology, endocrinology, etc.), organizations (ESC, AHA, ACC, NICE, WHO, etc.), topics, and publication year.
3. **Medical Section Hierarchy (5 -> 5.1 -> 5.1.1)**: Accurately reconstructs parent-child section trees, depth levels, and breadcrumbs.
4. **Clinical Marker Preservation**: Never drops short clinical tokens (`Class I`, `Level A`, `eGFR`, `BNP`, `NYHA`, `LVEF`, `Dose`).
5. **Tables & Figures**: Retains markdown representations, structured matrix rows/headers, and diagram provenance.
6. **Provenance Tracking**: Tracks document, page number, and bounding boxes for every semantic unit.
7. **Fault-Isolated Batch Processing**: An error in one file does not halt the batch.
8. **Storage & Repository Abstractions**: Zero vendor lock-in; ready to connect to Supabase, S3, or GCS.

## CLI Usage

```bash
# Ingest entire folder (1 to 1000+ documents)
python main.py ingest ./input

# Process a single file
python main.py process ./input/ESC_Guidelines_Heart_Failure_2023.pdf

# Check system overview & document inventory
python main.py status

# Inspect canonical hierarchy, section tree, and semantic units
python main.py inspect doc_abcdef123456

# Retry a failed document
python main.py retry doc_abcdef123456
```

## Running Tests

```bash
python3 -m pytest tests/ -v
```
