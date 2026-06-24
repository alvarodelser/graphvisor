#!/usr/bin/env python3
"""Gather all concepts from a GraphVisor corpus, compute their high-dimensional document grounding ball, project them to 2D via PCA, and generate concept embeddings."""

from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.decomposition import PCA

from config import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_TIMEOUT_S,
    DEFAULT_VECTORIZER_URL,
    EXPECTED_EMBEDDING_DIM,
    concept_embeddings_path,
    concepts_path,
    corpus_path,
    doc_embeddings_path,
)
from vectorizer_client import VectorizerError, check_vectorizer, embed_texts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract concepts, project their document grounding space via PCA, and generate embeddings.",
    )
    parser.add_argument(
        "--dataset",
        help="Dataset id (reads src/data/corpus_<id>.json and doc embeddings binary).",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Explicit corpus JSON path (overrides --dataset).",
    )
    parser.add_argument(
        "--output-bin",
        type=Path,
        help="Output path for concept embeddings binary file.",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        help="Output path for concept list JSON file.",
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
        help="Re-embed all concepts.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute embeddings but do not write files.",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip the initial vectorizer probe request.",
    )
    return parser.parse_args()


def resolve_paths(
    args: argparse.Namespace,
) -> tuple[Path, Path, Path, Path]:
    if args.input and args.dataset:
        raise SystemExit("Use either --dataset or --input, not both.")

    input_path = args.input or corpus_path(args.dataset or "112")
    if not input_path.exists():
        raise SystemExit(f"Corpus file not found: {input_path}")

    if args.dataset:
        doc_bin_path = doc_embeddings_path(args.dataset)
        bin_path = args.output_bin or concept_embeddings_path(args.dataset)
        json_path = args.output_json or concepts_path(args.dataset)
    else:
        doc_bin_path = input_path.with_name(input_path.stem + "_doc_embeddings.bin")
        bin_path = args.output_bin or input_path.with_name(
            input_path.stem + "_concept_embeddings.bin"
        )
        json_path = args.output_json or input_path.with_name(
            input_path.stem + "_concepts.json"
        )

    return input_path, doc_bin_path, bin_path, json_path


def load_corpus(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


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


def write_json_concepts(path: Path, data: Any) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        f.write("\n")
    tmp_path.replace(path)


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
    input_path, doc_bin_path, bin_path, json_path = resolve_paths(args)

    docs = load_corpus(input_path)

    # 1. Load document embeddings
    if not doc_bin_path.exists():
        print(f"Error: Document embeddings binary file not found at {doc_bin_path}. Run embed_corpus.py first.", file=sys.stderr)
        return 1

    doc_vectors = np.array(load_binary_embeddings(doc_bin_path, EXPECTED_EMBEDDING_DIM))
    if len(doc_vectors) != len(docs):
        print(f"Error: Document embeddings count ({len(doc_vectors)}) does not match corpus count ({len(docs)})", file=sys.stderr)
        return 1

    # 2. Map concepts to documents
    concept_to_doc_indices: dict[str, list[int]] = {}
    for doc_idx, doc in enumerate(docs):
        for arg in doc.get("data", []):
            concept_level = arg.get("concept_level", {})
            if concept_level:
                parent_concepts = concept_level.get("parent_concepts", [])
                for concept in parent_concepts:
                    if isinstance(concept, str):
                        c = concept.strip()
                        if c:
                            concept_to_doc_indices.setdefault(c, []).append(doc_idx)

    # Sort concept names alphabetically
    concepts = sorted(list(concept_to_doc_indices.keys()))
    print(f"Gathered {len(concepts)} unique concepts from corpus.")

    # 3. Load existing concepts to reuse embeddings
    existing_concept_names: list[str] = []
    existing_vectors: list[list[float]] = []
    concept_to_existing_vector: dict[str, list[float]] = {}

    if not args.force and json_path.exists() and bin_path.exists():
        try:
            with json_path.open(encoding="utf-8") as f:
                old_data = json.load(f)
            # Support transition from flat array to object array
            if isinstance(old_data, list) and len(old_data) > 0:
                if isinstance(old_data[0], dict):
                    existing_concept_names = [item["concept"] for item in old_data]
                else:
                    existing_concept_names = old_data

            existing_vectors = load_binary_embeddings(
                bin_path, EXPECTED_EMBEDDING_DIM
            )
            if len(existing_concept_names) == len(existing_vectors):
                concept_to_existing_vector = dict(
                    zip(existing_concept_names, existing_vectors)
                )
        except Exception as e:
            print(
                f"Warning: Could not load existing concept embeddings: {e}",
                file=sys.stderr,
            )

    # 4. Generate embeddings for the concept names themselves
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
        print(f"Embedding {len(concepts_to_embed)} / {len(concepts)} concept names...")
        if not args.skip_health_check:
            print(f"Checking vectorizer at {args.vectorizer_url} ...")
            try:
                check_vectorizer(
                    args.vectorizer_url, timeout_s=min(args.timeout, 30.0)
                )
            except VectorizerError as exc:
                print(f"Vectorizer unavailable: {exc}", file=sys.stderr)
                return 1
            print("Vectorizer OK")

        try:
            new_vectors = embed_texts(
                concepts_to_embed,
                url=args.vectorizer_url,
                batch_size=max(1, args.batch_size),
                normalize=args.normalize,
                timeout_s=args.timeout,
            )
        except VectorizerError as exc:
            print(str(exc), file=sys.stderr)
            return 1

        for idx, vector in zip(embed_indices, new_vectors):
            if len(vector) != EXPECTED_EMBEDDING_DIM:
                print(
                    f"Warning: Concept name index {idx} ('{concepts[idx]}') embedding "
                    f"dim={len(vector)} (expected {EXPECTED_EMBEDDING_DIM})",
                    file=sys.stderr,
                )
            concept_name_embeddings[idx] = vector
    else:
        print("All concept name embeddings are cached and up to date.")

    # 5. Fit PCA jointly on document + concept name embeddings
    concept_vectors = np.array(concept_name_embeddings)
    all_vectors = np.vstack([doc_vectors, concept_vectors])
    print(f"Fitting PCA on {len(doc_vectors)} document + {len(concept_vectors)} concept embeddings...")
    pca = PCA(n_components=2)
    pca.fit(all_vectors)
    doc_2d = pca.transform(doc_vectors)  # shape: (N_docs, 2)

    # 6. Compute document grounding ball for each concept
    concepts_data = []
    for idx, concept in enumerate(concepts):
        doc_indices = list(set(concept_to_doc_indices[concept]))
        concept_doc_vectors = doc_vectors[doc_indices]

        # Centroid in 1024-D
        centroid = np.mean(concept_doc_vectors, axis=0)

        # RMS Radius in 1024-D
        if len(concept_doc_vectors) > 1:
            diffs = concept_doc_vectors - centroid
            distances = np.linalg.norm(diffs, axis=1)
            radius = float(np.sqrt(np.mean(distances ** 2)))
        else:
            radius = 0.0

        # Enforce minimum radius so 1-doc concepts are represented as a small sphere
        radius = max(radius, 0.15)

        # Project 1024-D centroid to 2D
        centroid_2d = pca.transform(centroid.reshape(1, -1))[0]
        pca_x = float(centroid_2d[0])
        pca_y = float(centroid_2d[1])

        concepts_data.append({
            "concept": concept,
            "pca_x": pca_x,
            "pca_y": pca_y,
            "radius": radius
        })

    if args.dry_run:
        print("Dry run complete; files not written.")
        return 0

    # Ensure all name vectors are populated
    for i, vec in enumerate(concept_name_embeddings):
        if vec is None:
            print(
                f"Error: Embedding for concept '{concepts[i]}' was not computed.",
                file=sys.stderr,
            )
            return 1

    # Write concept output files
    write_binary_embeddings(bin_path, concept_name_embeddings)  # type: ignore
    write_json_concepts(json_path, concepts_data)
    print(f"Wrote concept embeddings binary to {bin_path}")
    print(f"Wrote concept grounding data to {json_path}")

    # Write doc PCA coordinates back into the corpus JSON
    for i, doc in enumerate(docs):
        doc["pca_x"] = float(doc_2d[i, 0])
        doc["pca_y"] = float(doc_2d[i, 1])
    write_corpus(input_path, docs, backup_source=input_path)
    print(f"Wrote doc PCA coordinates to corpus at {input_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
