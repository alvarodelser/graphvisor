#!/usr/bin/env python3
"""Enrich a GraphVisor corpus with per-paper citation counts.

For each document, the paper title (derived from the ``source`` field) is looked
up against Semantic Scholar; if no confident match is found, OpenAlex is tried as
a fallback. The first confident match writes ``citations: <n>`` onto the doc.
Papers with no confident match in either source are left untouched and reported.
"""

from __future__ import annotations

import argparse
import json
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from config import (
    CITATION_MATCH_THRESHOLD,
    CORPUS_PATH,
)
from openalex_client import OpenAlexError, search_paper as openalex_search
from semanticscholar_client import S2Error, search_paper as s2_search


def clean_title(source: str) -> str:
    """Strip a trailing ``" - <Journal>"`` suffix from a corpus ``source`` string.

    Splits on the *last* ``" - "`` separator so titles containing internal
    hyphens or dashes are preserved. Returns the trimmed input when no separator
    is present.
    """
    text = (source or "").strip()
    if " - " in text:
        head, _, _tail = text.rpartition(" - ")
        return head.strip()
    return text


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def best_match(
    query_title: str,
    candidates: list[dict[str, Any]],
    title_key: str,
) -> dict[str, Any] | None:
    """Return the candidate whose title is most similar to ``query_title``.

    Similarity is computed with ``difflib.SequenceMatcher`` over lowercased,
    whitespace-normalized titles. Returns the highest-scoring candidate whose
    ratio is at least ``CITATION_MATCH_THRESHOLD``, else ``None``.
    """
    query_norm = _normalize(query_title)
    best: dict[str, Any] | None = None
    best_score = 0.0
    for candidate in candidates:
        candidate_title = candidate.get(title_key)
        if not candidate_title:
            continue
        score = SequenceMatcher(None, query_norm, _normalize(candidate_title)).ratio()
        if score >= CITATION_MATCH_THRESHOLD and score > best_score:
            best = candidate
            best_score = score
    return best


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich a GraphVisor corpus with per-paper citation counts.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch papers that already have a citations value.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform lookups and report, but do not write the corpus file.",
    )
    return parser.parse_args()


def load_corpus(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"Expected a JSON array in {path}")
    return data


def write_corpus(path: Path, docs: list[dict[str, Any]]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(docs, handle, ensure_ascii=False, indent=4)
        handle.write("\n")
    tmp_path.replace(path)


def lookup_citations(title: str, skip_sources: set[str] | None = None) -> tuple[int | None, str | None, set[str]]:
    """Return ``(citation_count, source, not_found_sources)`` for a title.

    Tries OpenAlex first (its free API is reliable), then Semantic Scholar as a
    fallback (its unauthenticated tier throttles heavily). ``source`` is
    ``"openalex"`` or ``"s2"`` for a confident match, else ``None``.
    """
    skip_sources = skip_sources or set()
    not_found = set()

    if "openalex" not in skip_sources:
        try:
            oa_candidates = openalex_search(title)
            match = best_match(title, oa_candidates, "display_name")
            if match and match.get("cited_by_count") is not None:
                return int(match["cited_by_count"]), "openalex", not_found
            else:
                not_found.add("openalex")
        except OpenAlexError as exc:
            print(f"  OpenAlex lookup failed: {exc}")

    if "s2" not in skip_sources:
        try:
            s2_candidates = s2_search(title)
            match = best_match(title, s2_candidates, "title")
            if match and match.get("citationCount") is not None:
                return int(match["citationCount"]), "s2", not_found
            else:
                not_found.add("s2")
        except S2Error as exc:
            print(f"  Semantic Scholar lookup failed: {exc}")

    return None, None, not_found


def main() -> int:
    args = parse_args()
    input_path = output_path = CORPUS_PATH
    docs = load_corpus(input_path)

    docs_needing_enrichment = [
        doc for doc in docs
        if "citations" not in doc and clean_title(doc.get("source", ""))
    ]
    if not docs_needing_enrichment and not args.force:
        print("All documents already enriched; skipping. Pass --force to re-enrich.")
        return 0

    matched_s2 = 0
    matched_openalex = 0
    skipped = 0
    unmatched: list[str] = []

    for index, doc in enumerate(docs):
        if "citations" in doc and not args.force:
            skipped += 1
            continue

        title = clean_title(doc.get("source", ""))
        if not title:
            unmatched.append(f"(doc {index}: empty source)")
            continue

        skip_sources = set(doc.get("citation_not_found", []))
        if "openalex" in skip_sources and "s2" in skip_sources and not args.force:
            unmatched.append(title)
            print(f"[{index + 1}/{len(docs)}] previously unmatched: {title}")
            continue

        count, source, new_not_found = lookup_citations(title, skip_sources)

        if new_not_found:
            current = set(doc.get("citation_not_found", []))
            current.update(new_not_found)
            doc["citation_not_found"] = sorted(list(current))

        if source == "s2":
            doc["citations"] = count
            matched_s2 += 1
            print(f"[{index + 1}/{len(docs)}] s2={count}: {title}")
        elif source == "openalex":
            doc["citations"] = count
            matched_openalex += 1
            print(f"[{index + 1}/{len(docs)}] openalex={count}: {title}")
        else:
            unmatched.append(title)
            print(f"[{index + 1}/{len(docs)}] no match: {title}")

    print(
        f"\nSummary: {matched_s2} via Semantic Scholar, "
        f"{matched_openalex} via OpenAlex, {skipped} skipped, "
        f"{len(unmatched)} unmatched."
    )
    if unmatched:
        print("\nUnmatched titles (review manually):")
        for title in unmatched:
            print(f"  - {title}")

    if args.dry_run:
        print("\nDry run: corpus file not written.")
        return 0

    write_corpus(CORPUS_PATH, docs)
    print(f"\nWrote enriched corpus to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
