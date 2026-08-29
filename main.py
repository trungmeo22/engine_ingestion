#!/usr/bin/env python3
"""Medical Knowledge Engine CLI.

Usage:
  python main.py ingest <directory_path>
  python main.py process <file_or_directory_path>
  python main.py status
  python main.py retry <document_id>
  python main.py inspect <document_id>
"""

import argparse
import json
import logging
import sys
from pathlib import Path

_lib_dir = str(Path(__file__).resolve().parent / "lib")
if _lib_dir not in sys.path:
    sys.path.insert(0, _lib_dir)
if "." not in sys.path:
    sys.path.insert(0, ".")

from config import settings
from engines.batch_processor import BatchProcessor
from engines.document_manager import DocumentManager
from schemas.document import ProcessingStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("medical_engine.cli")


def cmd_ingest(args):
    """Discovers, registers, classifies, parses, and validates all documents in a folder."""
    input_path = Path(args.path)
    if not input_path.exists():
        print(f"Error: Path '{input_path}' does not exist.")
        sys.exit(1)

    print(f"\n=======================================================")
    print(f" MEDICAL KNOWLEDGE ENGINE - BATCH INGESTION")
    print(f" Target Directory: {input_path.resolve()}")
    print(f"=======================================================\n")

    processor = BatchProcessor()
    
    def on_progress(doc, current, total):
        status_symbol = "✓" if doc.processing_status == ProcessingStatus.completed else (
            "✗" if doc.processing_status == ProcessingStatus.failed else "⟳"
        )
        print(f"[{current}/{total}] {status_symbol} [{doc.document_id}] {doc.file_name} -> {doc.processing_status.value}")

    summary = processor.ingest_directory(input_path, on_progress=on_progress)

    print(f"\n=======================================================")
    print(f" BATCH PROCESSING SUMMARY")
    print(f"=======================================================")
    print(f" Total Discovered: {summary.total_discovered} documents")
    print(f" Completed:        {summary.completed}")
    print(f" Processing:       {summary.processing}")
    print(f" Failed:           {summary.failed}")
    print(f" Duplicates:       {summary.duplicate}")
    print(f"=======================================================\n")


def cmd_process(args):
    """Processes a single file or directory."""
    target_path = Path(args.path)
    if not target_path.exists():
        print(f"Error: Target path '{target_path}' does not exist.")
        sys.exit(1)

    processor = BatchProcessor()
    if target_path.is_file():
        print(f"\nProcessing single file: {target_path.name}")
        doc, is_dup = processor.process_single_file(target_path)
        print(f"\nDocument ID:   {doc.document_id}")
        print(f"Status:        {doc.processing_status.value}")
        print(f"Is Duplicate:  {is_dup}")
        print(f"Title:         {doc.title}")
        print(f"Type:          {doc.document_type.value}")
        print(f"Specialty:     {doc.specialty}")
        print(f"Organization:  {doc.organization}")
        print(f"Year:          {doc.publication_year}")
        if doc.error_message:
            print(f"Error:         {doc.error_message}")
    else:
        cmd_ingest(args)


def cmd_status(args):
    """Displays system-wide status and document inventory."""
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

    print(f"\n=======================================================")
    print(f" MEDICAL KNOWLEDGE ENGINE - STATUS OVERVIEW")
    print(f"=======================================================")
    print(f" Total Registered: {total} documents")
    print(f"   Completed:      {completed}")
    print(f"   In Progress:    {processing}")
    print(f"   Failed:         {failed}")
    print(f"   Duplicates:     {duplicates}")
    print(f"=======================================================\n")

    if docs:
        print(f"{'DOCUMENT ID':<20} {'TYPE':<14} {'STATUS':<12} {'RETRIES':<8} {'FILE NAME'}")
        print("-" * 80)
        for d in docs[:30]:  # show top 30
            print(f"{d.document_id:<20} {d.document_type.value:<14} {d.processing_status.value:<12} {d.retry_count:<8} {d.file_name}")
        if len(docs) > 30:
            print(f"... and {len(docs) - 30} more documents.")
    else:
        print("No documents registered yet. Run 'python main.py ingest ./input' to ingest files.")


def cmd_retry(args):
    """Retries processing for a failed document."""
    doc_id = args.document_id
    processor = BatchProcessor()
    print(f"Retrying document '{doc_id}'...")
    result = processor.retry_document(doc_id)
    if not result:
        print(f"Error: Document '{doc_id}' not found.")
        sys.exit(1)
    print(f"Result status: {result.processing_status.value}")
    if result.error_message:
        print(f"Error details: {result.error_message}")


def cmd_inspect(args):
    """Inspects detailed canonical structure, section tree, and semantic units for a document."""
    doc_id = args.document_id
    doc_mgr = DocumentManager()
    canonical = doc_mgr.get_canonical_document(doc_id)
    if not canonical:
        print(f"Error: Document '{doc_id}' not found.")
        sys.exit(1)

    doc = canonical.document
    print(f"\n=======================================================")
    print(f" DOCUMENT INSPECTION: {doc.document_id}")
    print(f"=======================================================")
    print(f" File Name:       {doc.file_name}")
    print(f" Title:           {doc.title}")
    print(f" Document Type:   {doc.document_type.value}")
    print(f" Organization:    {doc.organization}")
    print(f" Specialty:       {doc.specialty}")
    print(f" Topics:          {', '.join(doc.topics) if doc.topics else 'None'}")
    print(f" Status:          {doc.processing_status.value}")
    print(f" File Size:       {doc.file_size} bytes")
    print(f" SHA-256 Hash:    {doc.file_hash}")
    print(f" Total Sections:  {len(canonical.sections)}")
    print(f" Semantic Units:  {len(canonical.semantic_units)}")
    print(f" Validation:      {canonical.validation_summary.get('status') if canonical.validation_summary else 'N/A'}")
    print(f"=======================================================\n")

    print("--- SECTION TREE HIERARCHY ---")
    for sec in canonical.sections[:20]:
        indent = "  " * (sec.level - 1)
        num_str = f"[{sec.numbering_path}] " if sec.numbering_path else ""
        parent_str = f" (parent: {sec.parent_section_id})" if sec.parent_section_id else ""
        print(f"{indent}• {num_str}{sec.title}{parent_str}")
        print(f"{indent}  ↳ Breadcrumb: {sec.breadcrumb}")

    if len(canonical.sections) > 20:
        print(f"... and {len(canonical.sections) - 20} more sections.")

    print("\n--- SAMPLE SEMANTIC UNITS ---")
    for su in canonical.semantic_units[:10]:
        print(f"[{su.unit_id}] [{su.unit_type.value.upper()}] ({su.classification.value})")
        print(f"  Text: {su.text[:120]}..." if len(su.text) > 120 else f"  Text: {su.text}")
        if su.provenance:
            print(f"  Provenance: page {su.provenance.page}, bbox ({su.provenance.bbox.l}, {su.provenance.bbox.t}, {su.provenance.bbox.r}, {su.provenance.bbox.b})")
        print(f"  Section: {su.section_id} | Breadcrumb: {su.breadcrumb}")
        print()


def cmd_delete(args):
    """Hard-deletes a single failed document."""
    doc_mgr = DocumentManager()
    doc_id = args.document_id
    force = getattr(args, "force", False)

    print(f"\nAttempting to delete document: {doc_id} (force={force})")
    success, message, code = doc_mgr.delete_document(doc_id, force=force)
    if success:
        print(f"✓ Success: {message}")
    else:
        print(f"✗ Failed (Code {code}): {message}")
        sys.exit(1 if code != 404 else 0)


def cmd_delete_failed(args):
    """Hard-deletes all failed documents."""
    doc_mgr = DocumentManager()
    print("\nSearching and removing all failed documents from system...")
    report = doc_mgr.delete_failed_documents()
    print(f"✓ Deleted: {report['deleted_count']} failed document(s)")
    if report["deleted_documents"]:
        print(f"  Document IDs: {', '.join(report['deleted_documents'])}")
    if report["errors"]:
        print(f"  Errors: {report['errors']}")


def main():
    parser = argparse.ArgumentParser(description="Medical Knowledge Engine CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Ingest
    ingest_parser = subparsers.add_parser("ingest", help="Ingest a directory of medical documents")
    ingest_parser.add_argument("path", help="Path to the directory containing documents")
    ingest_parser.set_defaults(func=cmd_ingest)

    # Process
    process_parser = subparsers.add_parser("process", help="Process a file or directory")
    process_parser.add_argument("path", help="Path to file or directory")
    process_parser.set_defaults(func=cmd_process)

    # Status
    status_parser = subparsers.add_parser("status", help="Show system status and inventory")
    status_parser.set_defaults(func=cmd_status)

    # Retry
    retry_parser = subparsers.add_parser("retry", help="Retry a failed document")
    retry_parser.add_argument("document_id", help="Document ID to retry")
    retry_parser.set_defaults(func=cmd_retry)

    # Inspect
    inspect_parser = subparsers.add_parser("inspect", help="Inspect document sections and semantic units")
    inspect_parser.add_argument("document_id", help="Document ID to inspect")
    inspect_parser.set_defaults(func=cmd_inspect)

    # Delete
    delete_parser = subparsers.add_parser("delete", help="Hard-delete a failed document")
    delete_parser.add_argument("document_id", help="Document ID to delete")
    delete_parser.add_argument("--force", action="store_true", help="Force deletion even if not failed")
    delete_parser.set_defaults(func=cmd_delete)

    # Delete Failed
    delete_failed_parser = subparsers.add_parser("delete-failed", help="Hard-delete all failed documents")
    delete_failed_parser.set_defaults(func=cmd_delete_failed)

    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
