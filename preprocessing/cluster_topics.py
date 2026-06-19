#!/usr/bin/env python3
"""Run NMF clustering on corpus concepts to generate topics and label them via Ollama."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from sklearn.decomposition import NMF

from config import (
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OLLAMA_URL,
    corpus_path,
    topics_path,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NMF topic clustering on corpus concepts with Ollama labeling.",
    )
    parser.add_argument(
        "--dataset",
        choices=["5", "112"],
        help="Dataset id (reads/writes src/data/corpus_<id>.json and corpus_<id>_topics.json).",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Explicit corpus JSON path (overrides --dataset).",
    )
    parser.add_argument(
        "--output-topics",
        type=Path,
        help="Output topics JSON path.",
    )
    parser.add_argument(
        "--output-corpus",
        type=Path,
        help="Output corpus JSON path. Defaults to overwriting --input.",
    )
    parser.add_argument(
        "--n-topics",
        type=int,
        help="Number of topics/clusters to generate. Default uses heuristic based on corpus size.",
    )
    parser.add_argument(
        "--ollama-url",
        default=DEFAULT_OLLAMA_URL,
        help=f"Ollama base URL (default: {DEFAULT_OLLAMA_URL}).",
    )
    parser.add_argument(
        "--ollama-model",
        default=DEFAULT_OLLAMA_MODEL,
        help=f"Ollama model name (default: {DEFAULT_OLLAMA_MODEL}).",
    )
    parser.add_argument(
        "--ollama-timeout",
        type=float,
        default=300.0,
        help="HTTP timeout in seconds for each Ollama labeling request (default: 300).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute clusters and topics but do not write output files.",
    )
    return parser.parse_args()


def resolve_paths(args: argparse.Namespace) -> tuple[Path, Path, Path]:
    if args.input and args.dataset:
        raise SystemExit("Use either --dataset or --input, not both.")

    input_path = args.input or corpus_path(args.dataset or "112")
    if not input_path.exists():
        raise SystemExit(f"Corpus file not found: {input_path}")

    if args.dataset:
        topics_json_path = args.output_topics or topics_path(args.dataset)
    else:
        topics_json_path = args.output_topics or input_path.with_name(
            input_path.stem + "_topics.json"
        )

    output_corpus_path = args.output_corpus or input_path

    return input_path, topics_json_path, output_corpus_path


def load_corpus(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


def gather_unique_concepts(docs: list[dict[str, Any]]) -> list[str]:
    concepts = set()
    for doc in docs:
        for arg in doc.get("data", []):
            concept_level = arg.get("concept_level", {})
            if concept_level:
                parent_concepts = concept_level.get("parent_concepts", [])
                for c in parent_concepts:
                    if isinstance(c, str):
                        c_clean = c.strip()
                        if c_clean:
                            concepts.add(c_clean)
    return sorted(list(concepts))


def pick_k(n_docs: int) -> int:
    if n_docs <= 5:
        return 2
    if n_docs <= 20:
        return 3
    if n_docs <= 50:
        return 4
    return 5


def query_ollama_label(
    ollama_url: str,
    model: str,
    top_concepts: list[tuple[str, float]],
    paper_titles: list[str],
    timeout_s: float = 300.0,
) -> str | None:
    concepts_str = "\n".join(
        [f"- {concept} (weight: {weight:.3f})" for concept, weight in top_concepts]
    )
    papers_str = "\n".join([f"- {title}" for title in paper_titles])

    prompt = (
        "You are a taxonomy expert helping to label a research topic in a scientific corpus.\n"
        "Here are the top concepts associated with this topic (and their relative weights):\n"
        f"{concepts_str}\n\n"
        "Here are the titles of the research papers assigned to this topic:\n"
        f"{papers_str}\n\n"
        "Please generate a short, descriptive topic label (2 to 5 words maximum) that summarizes these papers and concepts.\n"
        "Return ONLY the topic label. Do not include any introductory or concluding text, explanations, or quotes."
    )

    url = f"{ollama_url.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }

    try:
        response = httpx.post(url, json=payload, timeout=timeout_s)
        response.raise_for_status()
        data = response.json()
        label = data.get("response", "").strip().strip('"').strip("'").strip()
        if label:
            return label
    except Exception as e:
        print(f"Warning: Failed to contact Ollama at {url}: {e}", file=sys.stderr)
    return None


def write_json(path: Path, data: Any, *, backup_source: Path | None = None) -> None:
    if backup_source and backup_source.exists() and backup_source.samefile(path):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = path.with_suffix(path.suffix + f".bak.{stamp}")
        shutil.copy2(path, backup_path)
        print(f"Backup written to {backup_path}")

    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=4)
        handle.write("\n")
    tmp_path.replace(path)


def main() -> int:
    args = parse_args()
    input_path, topics_json_path, output_corpus_path = resolve_paths(args)

    docs = load_corpus(input_path)
    concepts = gather_unique_concepts(docs)
    print(f"Loaded {len(docs)} documents and {len(concepts)} unique concepts.")

    if not concepts:
        print("Error: No concepts found in corpus.", file=sys.stderr)
        return 1

    # Map concept to its index
    concept_to_idx = {concept: idx for idx, concept in enumerate(concepts)}

    # Construct Document-Concept Matrix V (shape: M x N)
    M = len(docs)
    N = len(concepts)
    V = np.zeros((M, N))

    for doc_idx, doc in enumerate(docs):
        args_list = doc.get("data", [])
        num_args = len(args_list)
        if num_args == 0:
            continue

        for arg in args_list:
            confidence = arg.get("confidence", 1.0)
            concept_level = arg.get("concept_level", {})
            if not concept_level:
                continue
            parent_concepts = concept_level.get("parent_concepts", [])
            parent_concepts_cos = concept_level.get("parent_concepts_cos", [])

            for c_idx, concept in enumerate(parent_concepts):
                if concept in concept_to_idx:
                    g_idx = concept_to_idx[concept]
                    # Get cosine similarity if available
                    cos_sim = 1.0
                    if c_idx < len(parent_concepts_cos):
                        cos_sim = float(parent_concepts_cos[c_idx])
                    # Add to sparse vector
                    V[doc_idx, g_idx] += confidence * cos_sim

        # Normalize by number of arguments
        V[doc_idx, :] /= num_args

    # Run NMF to generate clusters
    K = args.n_topics or pick_k(M)
    print(f"Running NMF clustering to extract K={K} topics...")

    # NMF Decomposition
    # Ensure Matrix V has some non-zero elements
    if np.sum(V) == 0:
        print("Warning: Document-concept matrix is entirely empty. Creating trivial topics.", file=sys.stderr)
        # Handle fallback for trivial matrix
        W = np.zeros((M, K))
        for i in range(M):
            W[i, i % K] = 1.0
        H = np.zeros((K, N))
        for k in range(K):
            H[k, k % N] = 1.0
    else:
        nmf = NMF(n_components=K, init="random", random_state=42, max_iter=1000)
        W = nmf.fit_transform(V)
        H = nmf.components_

    # Determine topic assignment for each document
    assignments = []
    for doc_idx in range(M):
        topic_id = int(np.argmax(W[doc_idx])) if np.sum(W[doc_idx]) > 0 else 0
        assignments.append(topic_id)
        docs[doc_idx]["topic_id"] = topic_id

    # Build Topics JSON
    topics_list = []
    for k in range(K):
        # Find documents assigned to this topic
        topic_doc_indices = [idx for idx, t_id in enumerate(assignments) if t_id == k]
        topic_docs = [docs[idx] for idx in topic_doc_indices]
        doc_ids = [f"doc_{idx}" for idx in topic_doc_indices]
        arg_count = sum(len(doc.get("data", [])) for doc in topic_docs)

        # Find top concepts for this topic (sorting row H[k])
        concept_weights = H[k]
        top_indices = np.argsort(concept_weights)[::-1]
        top_concepts = []
        for idx in top_indices:
            if concept_weights[idx] > 0:
                top_concepts.append((concepts[idx], float(concept_weights[idx])))
        top_concepts = top_concepts[:10]  # Take top 10

        # Ask Ollama to generate a label
        paper_titles = [doc.get("source", "Untitled paper") for doc in topic_docs]
        label = None
        if top_concepts:
            label = query_ollama_label(
                args.ollama_url, args.ollama_model, top_concepts, paper_titles,
                timeout_s=args.ollama_timeout,
            )

        # Fallback if Ollama is not accessible or fails
        if not label:
            if top_concepts:
                # Fallback: join top 3 concepts
                top_3 = [item[0] for item in top_concepts[:3]]
                label = " / ".join(top_3)
            else:
                label = f"Topic {k + 1}"

        topics_list.append(
            {
                "id": k,
                "label": label,
                "docIds": doc_ids,
                "argCount": arg_count,
            }
        )
        print(f"Topic {k}: '{label}' ({len(doc_ids)} documents, {arg_count} arguments)")

    if args.dry_run:
        print("Dry run complete; no output files written.")
        return 0

    # Write files
    write_json(topics_json_path, topics_list)
    print(f"Wrote topics list to {topics_json_path}")

    # Save updated corpus
    in_place = input_path.resolve() == output_corpus_path.resolve()
    write_json(output_corpus_path, docs, backup_source=input_path if in_place else None)
    print(f"Wrote updated corpus with topic assignments to {output_corpus_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
