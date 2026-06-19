#!/usr/bin/env python3
"""Add document embeddings to a GraphVisor corpus JSON file via the local vectorizer."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import struct
from config import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_TIMEOUT_S,
    DEFAULT_VECTORIZER_URL,
    EMBEDDING_FIELD,
    EXPECTED_EMBEDDING_DIM,
    corpus_path,
    doc_embeddings_path,
)
from vectorizer_client import VectorizerError, check_vectorizer, embed_texts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate doc_embbeding vectors for a GraphVisor corpus JSON file.",
    )
    parser.add_argument(
        "--dataset",
        choices=["5", "112"],
        help="Dataset id (reads/writes src/data/corpus_<id>.json).",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Explicit corpus JSON path (overrides --dataset).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output path. Defaults to overwriting --input in place.",
    )
    parser.add_argument(
        "--vectorizer-url",
        default=DEFAULT_VECTORIZER_URL,
        help=f"Vectorizer /embed endpoint (default: {DEFAULT_VECTORIZER_URL}).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Texts per vectorizer request (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_S,
        help=f"HTTP timeout in seconds (default: {DEFAULT_TIMEOUT_S}).",
    )
    parser.add_argument(
        "--normalize",
        action="store_true",
        help="Ask the vectorizer to L2-normalize embeddings.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed documents that already have doc_embbeding.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute embeddings but do not write the corpus file.",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip the initial vectorizer probe request.",
    )
    return parser.parse_args()


def resolve_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    if args.input and args.dataset:
        raise SystemExit("Use either --dataset or --input, not both.")

    input_path = args.input or corpus_path(args.dataset or "112")
    if not input_path.exists():
        raise SystemExit(f"Corpus file not found: {input_path}")

    output_path = args.output or input_path
    return input_path, output_path


def document_text(doc: dict[str, Any]) -> str:
    title = (doc.get("source") or "").strip()
    abstract = (doc.get("abstract") or "").strip()
    
    parts = []
    if title:
        parts.append(title)
    if abstract:
        parts.append(abstract)
        
    if not parts:
        year = (doc.get("year") or "").strip()
        return f"Untitled document ({year})" if year else "Untitled document"
        
    return "\n".join(parts)


def load_binary_embeddings(path: Path, dim: int) -> list[list[float]]:
    if not path.exists():
        return []
    size = path.stat().st_size
    if size % (dim * 4) != 0:
        return []
    num_vectors = size // (dim * 4)
    vectors = []
    with path.open("rb") as f:
        for _ in range(num_vectors):
            data = f.read(dim * 4)
            if len(data) < dim * 4:
                break
            vectors.append(list(struct.unpack(f"{dim}f", data)))
    return vectors


def write_binary_embeddings(path: Path, vectors: list[list[float]]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("wb") as f:
        for vec in vectors:
            f.write(struct.pack(f"{len(vec)}f", *vec))
    tmp_path.replace(path)


def load_corpus(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


def write_corpus(path: Path, docs: list[dict[str, Any]], *, backup_source: Path | None) -> None:
    if backup_source and backup_source.exists() and backup_source.samefile(path):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = path.with_suffix(path.suffix + f".bak.{stamp}")
        shutil.copy2(path, backup_path)
        print(f"Backup written to {backup_path}")

    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(docs, handle, ensure_ascii=False, indent=4)
        handle.write("\n")
    tmp_path.replace(path)


def main() -> int:
    args = parse_args()
    input_path, output_path = resolve_paths(args)

    # Determine binary output path
    if args.dataset:
        bin_path = doc_embeddings_path(args.dataset)
    else:
        bin_path = output_path.with_name(output_path.stem + "_doc_embeddings.bin")

    docs = load_corpus(input_path)
    
    # Load existing binary embeddings if not forcing
    existing_vectors = []
    if not args.force:
        try:
            existing_vectors = load_binary_embeddings(bin_path, EXPECTED_EMBEDDING_DIM)
        except Exception as e:
            print(f"Warning: could not load existing binary embeddings: {e}", file=sys.stderr)

    vectors: list[list[float] | None] = [None] * len(docs)
    indices_to_embed: list[int] = []
    
    for i in range(len(docs)):
        if i < len(existing_vectors) and not args.force:
            vectors[i] = existing_vectors[i]
        else:
            indices_to_embed.append(i)

    if not indices_to_embed:
        print(f"No documents need embedding; existing binary embeddings at {bin_path} are up to date.")
        # Strip embeddings from JSON if present and write out the clean JSON
        json_changed = False
        for doc in docs:
            if EMBEDDING_FIELD in doc:
                del doc[EMBEDDING_FIELD]
                json_changed = True
        if json_changed and not args.dry_run:
            in_place = input_path.resolve() == output_path.resolve()
            write_corpus(output_path, docs, backup_source=input_path if in_place else None)
            print(f"Cleaned and wrote updated JSON corpus to {output_path}")
        return 0

    texts = [document_text(docs[i]) for i in indices_to_embed]
    print(f"Embedding {len(indices_to_embed)} / {len(docs)} documents from {input_path}")

    if not args.skip_health_check:
        print(f"Checking vectorizer at {args.vectorizer_url} ...")
        try:
            check_vectorizer(args.vectorizer_url, timeout_s=min(args.timeout, 30.0))
        except VectorizerError as exc:
            print(f"Vectorizer unavailable: {exc}", file=sys.stderr)
            return 1
        print("Vectorizer OK")

    try:
        new_vectors = embed_texts(
            texts,
            url=args.vectorizer_url,
            batch_size=max(1, args.batch_size),
            normalize=args.normalize,
            timeout_s=args.timeout,
        )
    except VectorizerError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    for idx, vector in zip(indices_to_embed, new_vectors):
        if len(vector) != EXPECTED_EMBEDDING_DIM:
            print(
                f"Warning: doc index {idx} embedding dim={len(vector)} "
                f"(expected {EXPECTED_EMBEDDING_DIM})",
                file=sys.stderr,
            )
        vectors[idx] = vector

    if args.dry_run:
        print("Dry run complete; corpus file and binary embeddings not written.")
        return 0

    # Ensure all vectors are populated
    for i, vec in enumerate(vectors):
        if vec is None:
            print(f"Error: Vector at index {i} was not computed.", file=sys.stderr)
            return 1

    # Write binary embeddings
    write_binary_embeddings(bin_path, vectors)  # type: ignore
    print(f"Wrote binary embeddings to {bin_path}")

    # Strip embedding field from JSON and write out the clean JSON
    for doc in docs:
        if EMBEDDING_FIELD in doc:
            del doc[EMBEDDING_FIELD]

    in_place = input_path.resolve() == output_path.resolve()
    write_corpus(output_path, docs, backup_source=input_path if in_place else None)
    print(f"Wrote cleaned JSON corpus to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
