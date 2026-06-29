#!/usr/bin/env python3
"""Merged document + concept embedding pipeline for a GraphVisor corpus."""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.decomposition import PCA

from config import (
    CONCEPT_EMBEDDINGS_PATH,
    CONCEPTS_PATH,
    CORPUS_PATH,
    DEFAULT_BATCH_SIZE,
    DEFAULT_TIMEOUT_S,
    DEFAULT_VECTORIZER_URL,
    DOC_EMBEDDINGS_PATH,
    EMBEDDING_FIELD,
    EXPECTED_EMBEDDING_DIM,
)
from vectorizer_client import VectorizerError, check_vectorizer, embed_texts


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def load_binary_embeddings(path: Path, dim: int) -> list[list[float]]:
    """Return [] if path doesn't exist or byte size is not a multiple of dim*4."""
    if not path.exists():
        return []
    size = path.stat().st_size
    if size % (dim * 4) != 0:
        return []
    num_vectors = size // (dim * 4)
    vectors: list[list[float]] = []
    with path.open("rb") as f:
        for _ in range(num_vectors):
            data = f.read(dim * 4)
            if len(data) < dim * 4:
                break
            vectors.append(list(struct.unpack(f"{dim}f", data)))
    return vectors


def write_binary(path: Path, vectors: list[list[float]]) -> None:
    """Atomically write vectors as packed 32-bit floats."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("wb") as f:
        for vec in vectors:
            f.write(struct.pack(f"{len(vec)}f", *vec))
    tmp_path.replace(path)


def write_json(path: Path, data: Any) -> None:
    """Atomically write *data* as pretty-printed JSON with a trailing newline."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write("\n")
    tmp_path.replace(path)


def load_corpus(path: Path) -> list[dict[str, Any]]:
    """Load a JSON array from *path*; raise SystemExit if not a list."""
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


def document_text(doc: dict[str, Any]) -> str:
    """Return the text to embed for *doc* (title + abstract with fallback)."""
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


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Embed GraphVisor corpus documents and concepts in one pass, "
            "then project everything to 2D via PCA."
        ),
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
        help="Re-run even if all outputs exist.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute embeddings but do not write any files.",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip the initial vectorizer probe request.",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    # --- Skip logic (idempotency) ---
    outputs_exist = (
        DOC_EMBEDDINGS_PATH.exists()
        and CONCEPT_EMBEDDINGS_PATH.exists()
        and CONCEPTS_PATH.exists()
    )
    if outputs_exist and not args.force:
        print("Embeddings already exist; skipping. Pass --force to re-embed.")
        return 0

    if not CORPUS_PATH.exists():
        print(f"Error: Corpus file not found at {CORPUS_PATH}", file=sys.stderr)
        return 1

    # Track whether the vectorizer health check has already run.
    vectorizer_checked = False

    # -----------------------------------------------------------------------
    # Step 1: Document embeddings
    # -----------------------------------------------------------------------
    docs = load_corpus(CORPUS_PATH)
    print(f"Loaded {len(docs)} documents from {CORPUS_PATH}")

    # Load existing doc vectors to reuse if not --force
    existing_doc_vectors: list[list[float]] = []
    if not args.force:
        try:
            existing_doc_vectors = load_binary_embeddings(
                DOC_EMBEDDINGS_PATH, EXPECTED_EMBEDDING_DIM
            )
        except Exception as exc:
            print(
                f"Warning: could not load existing doc embeddings: {exc}",
                file=sys.stderr,
            )

    doc_vectors: list[list[float] | None] = [None] * len(docs)
    indices_to_embed: list[int] = []

    for i in range(len(docs)):
        if i < len(existing_doc_vectors):
            doc_vectors[i] = existing_doc_vectors[i]
        else:
            indices_to_embed.append(i)

    if indices_to_embed:
        texts = [document_text(docs[i]) for i in indices_to_embed]
        print(
            f"Embedding {len(indices_to_embed)} / {len(docs)} documents..."
        )

        if not args.skip_health_check and not vectorizer_checked:
            print(f"Checking vectorizer at {args.vectorizer_url} ...")
            try:
                check_vectorizer(args.vectorizer_url, timeout_s=min(args.timeout, 30.0))
                vectorizer_checked = True
            except VectorizerError as exc:
                print(f"Vectorizer unavailable: {exc}", file=sys.stderr)
                return 1
            print("Vectorizer OK")

        try:
            new_doc_vecs = embed_texts(
                texts,
                url=args.vectorizer_url,
                batch_size=max(1, args.batch_size),
                normalize=args.normalize,
                timeout_s=args.timeout,
            )
        except VectorizerError as exc:
            print(str(exc), file=sys.stderr)
            return 1

        for idx, vec in zip(indices_to_embed, new_doc_vecs):
            if len(vec) != EXPECTED_EMBEDDING_DIM:
                print(
                    f"Warning: doc index {idx} embedding dim={len(vec)} "
                    f"(expected {EXPECTED_EMBEDDING_DIM})",
                    file=sys.stderr,
                )
            doc_vectors[idx] = vec
    else:
        print("All document embeddings are cached and up to date.")

    # Validate all doc vectors are populated
    for i, vec in enumerate(doc_vectors):
        if vec is None:
            print(f"Error: vector at doc index {i} was not computed.", file=sys.stderr)
            return 1

    doc_vectors_full: list[list[float]] = doc_vectors  # type: ignore[assignment]

    # -----------------------------------------------------------------------
    # Step 2: Concept embeddings + PCA
    # -----------------------------------------------------------------------

    # Collect unique concept names from corpus
    concept_to_doc_indices: dict[str, list[int]] = {}
    for doc_idx, doc in enumerate(docs):
        for arg in doc.get("data", []):
            concept_level = arg.get("concept_level", {})
            if concept_level:
                for concept in concept_level.get("parent_concepts", []):
                    if isinstance(concept, str):
                        c = concept.strip()
                        if c:
                            concept_to_doc_indices.setdefault(c, []).append(doc_idx)

    concepts = sorted(concept_to_doc_indices.keys())
    print(f"Gathered {len(concepts)} unique concepts from corpus.")

    # Load cached concept name embeddings to reuse if not --force
    concept_to_existing_vector: dict[str, list[float]] = {}
    if not args.force and CONCEPTS_PATH.exists() and CONCEPT_EMBEDDINGS_PATH.exists():
        try:
            with CONCEPTS_PATH.open(encoding="utf-8") as f:
                old_data = json.load(f)
            existing_concept_names: list[str] = []
            if isinstance(old_data, list) and old_data:
                if isinstance(old_data[0], dict):
                    existing_concept_names = [item["concept"] for item in old_data]
                else:
                    existing_concept_names = old_data
            existing_concept_vecs = load_binary_embeddings(
                CONCEPT_EMBEDDINGS_PATH, EXPECTED_EMBEDDING_DIM
            )
            if len(existing_concept_names) == len(existing_concept_vecs):
                concept_to_existing_vector = dict(
                    zip(existing_concept_names, existing_concept_vecs)
                )
        except Exception as exc:
            print(
                f"Warning: could not load existing concept embeddings: {exc}",
                file=sys.stderr,
            )

    concept_name_embeddings: list[list[float] | None] = [None] * len(concepts)
    concepts_to_embed: list[str] = []
    embed_indices: list[int] = []

    for idx, concept in enumerate(concepts):
        if concept in concept_to_existing_vector:
            concept_name_embeddings[idx] = concept_to_existing_vector[concept]
        else:
            concepts_to_embed.append(concept)
            embed_indices.append(idx)

    if concepts_to_embed:
        print(
            f"Embedding {len(concepts_to_embed)} / {len(concepts)} concept names..."
        )

        if not args.skip_health_check and not vectorizer_checked:
            print(f"Checking vectorizer at {args.vectorizer_url} ...")
            try:
                check_vectorizer(args.vectorizer_url, timeout_s=min(args.timeout, 30.0))
                vectorizer_checked = True
            except VectorizerError as exc:
                print(f"Vectorizer unavailable: {exc}", file=sys.stderr)
                return 1
            print("Vectorizer OK")

        try:
            new_concept_vecs = embed_texts(
                concepts_to_embed,
                url=args.vectorizer_url,
                batch_size=max(1, args.batch_size),
                normalize=args.normalize,
                timeout_s=args.timeout,
            )
        except VectorizerError as exc:
            print(str(exc), file=sys.stderr)
            return 1

        for idx, vec in zip(embed_indices, new_concept_vecs):
            if len(vec) != EXPECTED_EMBEDDING_DIM:
                print(
                    f"Warning: concept '{concepts[idx]}' embedding dim={len(vec)} "
                    f"(expected {EXPECTED_EMBEDDING_DIM})",
                    file=sys.stderr,
                )
            concept_name_embeddings[idx] = vec
    else:
        print("All concept name embeddings are cached and up to date.")

    # Validate all concept vectors are populated
    for i, vec in enumerate(concept_name_embeddings):
        if vec is None:
            print(
                f"Error: embedding for concept '{concepts[i]}' was not computed.",
                file=sys.stderr,
            )
            return 1

    concept_name_embeddings_full: list[list[float]] = concept_name_embeddings  # type: ignore[assignment]

    # Fit PCA jointly on doc + concept name vectors
    doc_np = np.array(doc_vectors_full)
    concept_np = np.array(concept_name_embeddings_full)
    all_vectors = np.vstack([doc_np, concept_np])
    print(
        f"Fitting PCA on {len(doc_np)} document + {len(concept_np)} concept embeddings..."
    )
    pca = PCA(n_components=2)
    pca.fit(all_vectors)
    doc_2d = pca.transform(doc_np)  # shape (N_docs, 2)

    # Compute grounding ball for each concept
    concepts_data: list[dict[str, Any]] = []
    for idx, concept in enumerate(concepts):
        doc_indices = list(set(concept_to_doc_indices[concept]))
        concept_doc_vecs = doc_np[doc_indices]

        centroid = np.mean(concept_doc_vecs, axis=0)

        if len(concept_doc_vecs) > 1:
            diffs = concept_doc_vecs - centroid
            distances = np.linalg.norm(diffs, axis=1)
            radius = float(np.sqrt(np.mean(distances ** 2)))
        else:
            radius = 0.0

        radius = max(radius, 0.15)

        centroid_2d = pca.transform(centroid.reshape(1, -1))[0]
        concepts_data.append(
            {
                "concept": concept,
                "pca_x": float(centroid_2d[0]),
                "pca_y": float(centroid_2d[1]),
                "radius": radius,
            }
        )

    # -----------------------------------------------------------------------
    # Dry run
    # -----------------------------------------------------------------------
    if args.dry_run:
        print("Dry run complete; files not written.")
        return 0

    # -----------------------------------------------------------------------
    # Write outputs
    # -----------------------------------------------------------------------
    write_binary(DOC_EMBEDDINGS_PATH, doc_vectors_full)
    print(f"Wrote doc embeddings to {DOC_EMBEDDINGS_PATH}")

    write_binary(CONCEPT_EMBEDDINGS_PATH, concept_name_embeddings_full)
    print(f"Wrote concept embeddings to {CONCEPT_EMBEDDINGS_PATH}")

    write_json(CONCEPTS_PATH, concepts_data)
    print(f"Wrote concept grounding data to {CONCEPTS_PATH}")

    # Write pca_x/pca_y into each doc, strip EMBEDDING_FIELD if present
    for i, doc in enumerate(docs):
        doc["pca_x"] = float(doc_2d[i, 0])
        doc["pca_y"] = float(doc_2d[i, 1])
        doc.pop(EMBEDDING_FIELD, None)

    write_json(CORPUS_PATH, docs)
    print(f"Wrote doc PCA coordinates to corpus at {CORPUS_PATH}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
