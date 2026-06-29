#!/usr/bin/env python3
"""Run NMF clustering on corpus concepts to generate topics and label them via Ollama."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from sklearn.decomposition import NMF

from config import (
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OLLAMA_URL,
    CORPUS_PATH,
    TOPICS_PATH,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NMF topic clustering on corpus concepts with Ollama labeling.",
    )
    parser.add_argument("--n-topics", type=int, help="Number of topics/clusters.")
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL, help="Ollama base URL.")
    parser.add_argument("--ollama-model", default=DEFAULT_OLLAMA_MODEL, help="Ollama model name.")
    parser.add_argument("--ollama-timeout", type=float, default=600.0, help="HTTP timeout per attempt.")
    parser.add_argument("--ollama-retries", type=int, default=3, help="Max retry attempts for Ollama calls.")
    parser.add_argument("--dry-run", action="store_true", help="Compute but do not write.")
    parser.add_argument("--force", action="store_true", help="Re-cluster even if topics file already exists.")
    return parser.parse_args()


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
                for c in concept_level.get("parent_concepts", []):
                    if isinstance(c, str) and c.strip():
                        concepts.add(c.strip())
    return sorted(list(concepts))


def pick_k(n_docs: int) -> int:
    if n_docs <= 5: return 2
    if n_docs <= 20: return 3
    if n_docs <= 50: return 4
    return 5


def query_ollama_label(ollama_url: str, model: str, top_concepts: list[tuple[str, float]], paper_titles: list[str],
                       timeout_s: float = 600.0, max_retries: int = 3) -> str | None:
    concepts_str = "\n".join([f"- {concept} (weight: {weight:.3f})" for concept, weight in top_concepts])
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
    payload = {"model": model, "prompt": prompt, "stream": False}
    for attempt in range(1, max_retries + 1):
        try:
            response = httpx.post(url, json=payload, timeout=timeout_s)
            response.raise_for_status()
            label = response.json().get("response", "").strip().strip('"').strip("'").strip()
            return label if label else None
        except Exception as e:
            print(f"Warning: Ollama attempt {attempt}/{max_retries} failed: {e}", file=sys.stderr)
            if attempt < max_retries:
                time.sleep(5 * attempt)
    return None


def write_json(path: Path, data: Any) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=4)
        handle.write("\n")
    tmp_path.replace(path)


def main() -> int:
    args = parse_args()

    if TOPICS_PATH.exists() and not args.force:
        print("Topics already exist; skipping. Pass --force to re-cluster.")
        return 0

    input_path = CORPUS_PATH
    topics_json_path = TOPICS_PATH
    output_corpus_path = CORPUS_PATH

    docs = load_corpus(input_path)
    concepts = gather_unique_concepts(docs)
    print(f"Loaded {len(docs)} documents and {len(concepts)} unique concepts.")

    if not concepts:
        print("Error: No concepts found in corpus.", file=sys.stderr)
        return 1

    concept_to_idx = {concept: idx for idx, concept in enumerate(concepts)}
    M, N = len(docs), len(concepts)
    V = np.zeros((M, N))

    # Construct Document-Concept Matrix V
    for doc_idx, doc in enumerate(docs):
        args_list = doc.get("data", [])
        num_args = len(args_list)
        if num_args == 0: continue

        for arg in args_list:
            confidence = arg.get("confidence", 1.0)
            concept_level = arg.get("concept_level", {})
            parent_concepts = concept_level.get("parent_concepts", [])
            parent_concepts_cos = concept_level.get("parent_concepts_cos", [])

            for c_idx, concept in enumerate(parent_concepts):
                if concept in concept_to_idx:
                    g_idx = concept_to_idx[concept]
                    cos_sim = float(parent_concepts_cos[c_idx]) if c_idx < len(parent_concepts_cos) else 1.0
                    V[doc_idx, g_idx] += confidence * cos_sim

        # FIX 1a: Term Frequency (TF) normalization
        V[doc_idx, :] /= num_args

    # FIX 1b: Apply Inverse Document Frequency (IDF)
    # This prevents hub/generic concepts from dominating the factorization
    doc_frequencies = np.sum(V > 0, axis=0)
    idf_weights = np.log((M + 1) / (doc_frequencies + 1)) + 1.0
    V = V * idf_weights

    K = args.n_topics or pick_k(M)
    print(f"Running NMF clustering to extract K={K} topics...")

    if np.sum(V) == 0:
        W = np.zeros((M, K))
        for i in range(M): W[i, i % K] = 1.0
        H = np.zeros((K, N))
        for k in range(K): H[k, k % N] = 1.0
    else:
        nmf = NMF(n_components=K, init="nndsvd", random_state=42, max_iter=1000)
        W = nmf.fit_transform(V)
        H = nmf.components_

    # Determine primary topic assignment for each document
    assignments = []
    for doc_idx in range(M):
        # Fallback to -1 (unassigned) instead of forcing empty docs into topic 0
        topic_id = int(np.argmax(W[doc_idx])) if np.sum(W[doc_idx]) > 0 else -1
        assignments.append(topic_id)
        docs[doc_idx]["topic_id"] = topic_id

    topics_list = []
    for k in range(K):
        # FIX 2: Handle "Winner-Takes-All" Zero-Doc issue
        topic_doc_indices = [idx for idx, t_id in enumerate(assignments) if t_id == k]

        # If the topic lost all `argmax` assignments, grab the top 3 documents
        # where this topic has the absolute highest activation weight in the W matrix.
        if len(topic_doc_indices) == 0:
            top_docs_for_k = np.argsort(W[:, k])[::-1]
            topic_doc_indices = [idx for idx in top_docs_for_k if W[idx, k] > 0][:3]

        topic_docs = [docs[idx] for idx in topic_doc_indices]
        doc_ids = [f"doc_{idx}" for idx in topic_doc_indices]
        arg_count = sum(len(doc.get("data", [])) for doc in topic_docs)

        # Get Top Concepts
        concept_weights = H[k]
        top_indices = np.argsort(concept_weights)[::-1]
        top_concepts = [(concepts[idx], float(concept_weights[idx])) for idx in top_indices if
                        concept_weights[idx] > 0][:10]

        paper_titles = [doc.get("source", "Untitled paper") for doc in topic_docs]
        label = query_ollama_label(args.ollama_url, args.ollama_model, top_concepts, paper_titles,
                                   args.ollama_timeout, args.ollama_retries) if top_concepts else None

        if not label:
            label = " / ".join([item[0] for item in top_concepts[:3]]) if top_concepts else f"Topic {k + 1}"

        topics_list.append({"id": k, "label": label, "docIds": doc_ids, "argCount": arg_count})
        print(f"Topic {k}: '{label}' ({len(doc_ids)} documents, {arg_count} arguments)")

    if args.dry_run:
        print("Dry run complete; no output files written.")
        return 0

    write_json(topics_json_path, topics_list)
    write_json(CORPUS_PATH, docs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())